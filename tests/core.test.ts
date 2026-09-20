import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { Collection, RequestdockPlugin, RequestResult, RequestSpec, RunResult } from '../src/shared/types.js';
import { executeRequest, MAX_RUN_REPORT_BYTES, runCollection } from '../src/core/engine.js';
import { compareRuns } from '../src/core/diff.js';
import { loadPlugins } from '../src/core/plugins.js';
import { parseCollection } from '../src/core/schema.js';
import { jsonPathTokens, readJsonPath } from '../src/core/paths.js';

let server: Server;
let origin = '';
let redirectedHits = 0;
let pluginDirectory = '';
const sequence: string[] = [];
const budgetRequests: string[] = [];
const spec = (overrides: Partial<RequestSpec> = {}): RequestSpec => ({
  id: 'test', name: 'Test request', method: 'GET', url: `${origin}/json`, headers: {}, assertions: [], ...overrides,
});
const collection = (requests: RequestSpec[] = [spec()]): Collection => ({ version: 1, name: 'Fixture', variables: {}, requests });
const run = (results: RequestResult[]): RunResult => ({ id: 'run', collectionName: 'Fixture', timestamp: 'now', passed: true, results });

beforeAll(async () => {
  pluginDirectory = await mkdtemp(join(tmpdir(), 'requestdock-plugin-tests-'));
  server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    response.setHeader('content-type', 'application/json');
    if (url.pathname === '/json') {
      response.setHeader('x-fixture', 'works');
      response.end(JSON.stringify({ ok: true, items: [{ id: 1 }], metadata: { b: 2, a: 1 } }));
    } else if (url.pathname === '/echo') {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      response.setHeader('set-cookie', 'session=private-cookie');
      response.setHeader('x-api-key', request.headers.authorization ?? 'server-secret');
      response.end(JSON.stringify({ path: request.url, authorization: request.headers.authorization, token: request.headers.authorization?.replace(/^Bearer\s+/i, ''), body: Buffer.concat(chunks).toString() }));
    } else if (url.pathname === '/cookie-echo') {
      response.setHeader('set-cookie', [
        'session=response-session-secret; Expires=Wed, 21 Oct 2030 07:28:00 GMT; HttpOnly; Path=/',
        'refresh=response-refresh-secret=; Secure; SameSite=Strict',
      ]);
      response.end(JSON.stringify({
        requestSession: 'request-session-secret', requestRefresh: 'request-refresh-secret=',
        responseSession: 'response-session-secret', responseRefresh: 'response-refresh-secret=',
        path: '/',
      }));
    } else if (url.pathname === '/slow' || url.pathname === '/slow-body') {
      if (url.pathname === '/slow-body') { response.writeHead(200); response.write('{'); }
      setTimeout(() => response.end(url.pathname === '/slow-body' ? '}' : '{}'), 200);
    } else if (url.pathname === '/large') {
      response.write('a'.repeat(1024 * 1024));
      response.end('b'.repeat(1024 * 1024 + 1));
    } else if (url.pathname === '/report-budget') {
      budgetRequests.push(url.searchParams.get('id') ?? '');
      response.setHeader('x-budget', 'fixture');
      response.end('a'.repeat(1024 * 1024));
    } else if (url.pathname === '/redirect') {
      response.statusCode = 302;
      response.setHeader('location', '/destination');
      response.end('{}');
    } else if (url.pathname === '/destination') {
      redirectedHits++;
      response.end('{}');
    } else if (url.pathname === '/bad-json') {
      response.end('not-json');
    } else if (url.pathname === '/sequence') {
      sequence.push(url.searchParams.get('id') ?? '');
      response.end('{}');
    } else {
      response.statusCode = 500;
      response.end('{"error":"fixture failure"}');
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing fixture address');
  origin = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((done, reject) => server.close(error => error ? reject(error) : done()));
  await rm(pluginDirectory, { recursive: true, force: true });
});

describe('collection validation', () => {
  it('adds declarative defaults and rejects script fields', () => {
    const parsed = parseCollection({ version: 1, name: 'Defaults', requests: [{ id: 'one', name: 'One', method: 'GET', url: `${origin}/json` }] });
    expect(parsed.variables).toEqual({});
    expect(parsed.requests[0].headers).toEqual({});
    expect(parsed.requests[0].assertions).toEqual([]);
    expect(() => parseCollection({ ...collection(), script: 'throw new Error()' })).toThrow();
    expect(() => parseCollection(collection([spec({ preRequestScript: 'alert()' } as unknown as RequestSpec)]))).toThrow();
  });
  it('rejects duplicate ids, invalid methods, invalid paths and non-HTTP URLs', () => {
    expect(() => parseCollection(collection([spec(), spec()]))).toThrow(/Duplicate request id/);
    expect(() => parseCollection(collection([spec({ method: 'TRACE' as RequestSpec['method'] })]))).toThrow();
    expect(() => parseCollection(collection([spec({ assertions: [{ type: 'json', path: '$..ok', expected: true }] })]))).toThrow();
    expect(() => parseCollection(collection([spec({ url: 'file:///etc/passwd' })]))).toThrow(/HTTP/);
  });
  it('validates size, timeout and assertion bounds', () => {
    expect(() => parseCollection(collection([spec({ timeoutMs: 60001 })]))).toThrow();
    expect(() => parseCollection(collection([spec({ method: 'POST', body: 'a'.repeat(1024 * 1024 + 1) })]))).toThrow(/1 MiB/);
    expect(() => parseCollection(collection([spec({ assertions: [{ type: 'status', expected: 99 }] })]))).toThrow();
    expect(() => parseCollection(collection([spec({ assertions: [{ type: 'json', path: '$' } as RequestSpec['assertions'][number]] })]))).toThrow();
  });
});

describe('HTTP execution', () => {
  it('checks status, case-insensitive headers, deep JSON, and array indexes', async () => {
    const result = await executeRequest(spec({ assertions: [
      { type: 'status', expected: 200 },
      { type: 'header', name: 'X-Fixture', expected: 'works' },
      { type: 'json', path: '$.items[0].id', expected: 1 },
      { type: 'json', path: 'items.0.id', expected: 1 },
      { type: 'json', path: 'metadata', expected: { a: 1, b: 2 } },
    ] }));
    expect(result.error).toBeUndefined();
    expect(result.checks.filter(check => !check.passed)).toEqual([]);
    expect(result.passed).toBe(true);
    expect(result.checks).toHaveLength(5);
    expect(result.bytes).toBe(Buffer.byteLength(result.body));
  });
  it('checks the response-time boundary independently of hosted runner speed', async () => {
    const transport = vi.spyOn(globalThis, 'fetch');
    const clock = vi.spyOn(performance, 'now');
    try {
      for (const duration of [999, 1000, 1001]) {
        const response = new Response('{"ok":true}', { status: 200 });
        transport.mockResolvedValueOnce(response);
        clock.mockReset().mockReturnValueOnce(0).mockReturnValue(duration);
        const result = await executeRequest(spec({ assertions: [{ type: 'time', maxMs: 1000 }] }));
        expect(result.error).toBeUndefined();
        expect(result.durationMs).toBe(duration);
        expect(result.checks[0].passed).toBe(duration <= 1000);
        expect(result.passed).toBe(duration <= 1000);
      }
    } finally { transport.mockRestore(); clock.mockRestore(); }
  });
  it('preserves assertion failures and fails missing JSON paths', async () => {
    const result = await executeRequest(spec({ assertions: [
      { type: 'status', expected: 201 }, { type: 'json', path: '$.missing', expected: null },
      { type: 'header', name: 'missing', expected: 'yes' }, { type: 'time', maxMs: 0 },
    ] }));
    expect(result.passed).toBe(false);
    expect(result.checks.every(check => !check.passed)).toBe(true);
    expect(result.error).toBeUndefined();
  });
  it('substitutes URL, headers and body, then redacts only after assertions', async () => {
    const result = await executeRequest(spec({
      method: 'POST', url: '{{baseUrl}}/echo?access={{api_key}}', headers: { Authorization: 'Bearer {{api_key}}' },
      body: '{"secret":"{{api_key}}"}', assertions: [
        { type: 'json', path: 'authorization', expected: 'Bearer very-private-value' },
        { type: 'header', name: 'x-api-key', expected: 'Bearer very-private-value' },
      ],
    }), { variables: { baseUrl: origin, api_key: 'very-private-value' } });
    expect(result.passed).toBe(true);
    expect(JSON.stringify(result)).not.toContain('very-private-value');
    expect(result.url).toContain('[REDACTED]');
    expect(result.headers['set-cookie']).toBe('[REDACTED]');
    expect(result.headers['x-api-key']).toBe('[REDACTED]');
  });
  it('fails clearly for undefined variables, invalid protocol, or network errors', async () => {
    expect((await executeRequest(spec({ url: '{{missing}}/json' }))).error).toMatch(/Undefined variable: missing/);
    expect((await executeRequest(spec({ url: `${origin}/{{broken` }))).error).toMatch(/placeholder/);
    expect((await executeRequest(spec({ url: '{{url}}' }), { variables: { url: 'ftp://example.test/file' } })).error).toMatch(/HTTP/);
    const deadServer = createServer();
    deadServer.listen(0, '127.0.0.1');
    await once(deadServer, 'listening');
    const address = deadServer.address();
    if (!address || typeof address === 'string') throw new Error('Missing test address');
    await new Promise<void>(done => deadServer.close(() => done()));
    const failed = await executeRequest(spec({ url: `http://127.0.0.1:${address.port}`, timeoutMs: 500 }));
    expect(failed.passed).toBe(false);
    expect(failed.error).toBeTruthy();
  });
  it('redacts escaped secret values in returned JSON without changing assertion inputs', async () => {
    const secret = 'quoted"secret\\value';
    const result = await executeRequest(spec({
      method: 'POST', url: `${origin}/echo`, body: '{{password}}',
      assertions: [{ type: 'json', path: 'body', expected: secret }],
    }), { variables: { password: secret } });
    expect(result.passed).toBe(true);
    expect(result.body).toContain('[REDACTED]');
    expect(result.body).not.toContain(JSON.stringify(secret).slice(1, -1));
    expect(result.checks[0].message).not.toContain('quoted');
  });
  it('redacts literal bearer credentials and sensitive query parameters even without variables', async () => {
    const result = await executeRequest(spec({
      url: `${origin}/echo?api_key=literal-query-secret`, headers: { Authorization: 'Bearer literal-header-secret' },
      assertions: [{ type: 'json', path: 'token', expected: 'literal-header-secret' }],
    }));
    expect(result.passed).toBe(true);
    expect(JSON.stringify(result)).not.toContain('literal-header-secret');
    expect(JSON.stringify(result)).not.toContain('literal-query-secret');
  });
  it('redacts individual request and response cookie values while preserving raw assertion inputs', async () => {
    const result = await executeRequest(spec({
      url: `${origin}/cookie-echo`,
      headers: { Cookie: 'session=request-session-secret; refresh="request-refresh-secret="' },
      assertions: [{ type: 'json', path: 'responseRefresh', expected: 'response-refresh-secret=' }],
    }));
    expect(result.passed).toBe(true);
    for (const secret of ['request-session-secret', 'request-refresh-secret=', 'response-session-secret', 'response-refresh-secret=']) {
      expect(JSON.stringify(result)).not.toContain(secret);
    }
    expect(result.headers['set-cookie']).toBe('[REDACTED]');
    expect(JSON.parse(result.body).path).toBe('/');
  });
  it('times out both waiting for headers and streaming a body', async () => {
    for (const endpoint of ['/slow', '/slow-body']) {
      const result = await executeRequest(spec({ url: `${origin}${endpoint}`, timeoutMs: 30 }));
      expect(result.passed).toBe(false);
      expect(result.error).toMatch(/timed out after 30 ms/);
    }
  });
  it('stops reading a response after the 2 MiB cap', async () => {
    const result = await executeRequest(spec({ url: `${origin}/large` }));
    expect(result.passed).toBe(false);
    expect(result.error).toMatch(/2 MiB/);
    expect(result.body).toBe('');
  });
  it('returns redirects without following them', async () => {
    const before = redirectedHits;
    const result = await executeRequest(spec({ url: `${origin}/redirect`, assertions: [{ type: 'status', expected: 302 }] }));
    expect(result.passed).toBe(true);
    expect(result.status).toBe(302);
    expect(redirectedHits).toBe(before);
  });
  it('turns invalid JSON into a failed check and allows explicit negative HTTP tests', async () => {
    const badJson = await executeRequest(spec({ url: `${origin}/bad-json`, assertions: [{ type: 'json', path: '$.ok', expected: true }] }));
    expect(badJson.checks[0].message).toContain('not valid JSON');
    const expectedFailure = await executeRequest(spec({ url: `${origin}/failure`, assertions: [{ type: 'status', expected: 500 }] }));
    expect(expectedFailure.passed).toBe(true);
  });
  it('runs sequentially, merges variables, and continues after failed requests', async () => {
    sequence.length = 0;
    const suite = collection([
      spec({ id: 'first', url: '{{baseUrl}}/sequence?id=first' }),
      spec({ id: 'failed', url: '{{unknown}}' }),
      spec({ id: 'second', url: '{{baseUrl}}/sequence?id=second' }),
    ]);
    suite.variables.baseUrl = 'http://unreachable.invalid';
    const result = await runCollection(suite, { variables: { baseUrl: origin } });
    expect(sequence).toEqual(['first', 'second']);
    expect(result.results).toHaveLength(3);
    expect(result.passed).toBe(false);
    expect(result.results[2].passed).toBe(true);
  });
  it('bounds serialized run reports and never sends requests after the report budget is exhausted', async () => {
    budgetRequests.length = 0;
    const requests = Array.from({ length: 17 }, (_, index) => spec({
      id: `budget-${index}`, name: index === 16 ? 'never-log-this-cookie' : `Budget request ${index}`,
      url: `${origin}/report-budget?id=${index}${index === 16 ? '&token=never-log-this-cookie' : ''}`,
    }));
    const result = await runCollection(collection(requests));
    expect(MAX_RUN_REPORT_BYTES).toBe(16 * 1024 * 1024);
    expect(result.passed).toBe(false);
    expect(result.results.map(item => item.requestId)).toEqual(requests.map(item => item.id));
    expect(budgetRequests).toEqual(Array.from({ length: 16 }, (_, index) => String(index)));
    expect(result.results.slice(0, 15).every(item => item.passed && item.body.length === 1024 * 1024)).toBe(true);
    const exceeded = result.results[15];
    expect(exceeded).toMatchObject({ status: 200, passed: false, body: '', headers: {}, url: '', bytes: 1024 * 1024 });
    expect(exceeded.error).toMatch(/16 MiB.*response was omitted/);
    expect(exceeded.checks).toEqual([{ name: 'Run report size limit', passed: false, message: exceeded.error }]);
    const skipped = result.results[16];
    expect(skipped).toMatchObject({ status: 0, passed: false, body: '', headers: {}, url: '', bytes: 0 });
    expect(skipped.error).toMatch(/Not sent.*16 MiB/);
    const report = JSON.stringify(result);
    expect(report).not.toContain('never-log-this-cookie');
    expect(Buffer.byteLength(report, 'utf8')).toBeLessThanOrEqual(MAX_RUN_REPORT_BYTES);
  });
});

describe('trusted explicit plugins', () => {
  it('loads the example .mjs plugin and applies a custom assertion', async () => {
    const plugins = await loadPlugins([resolve('examples/plugins/required-keys.mjs')]);
    const result = await executeRequest(spec({ assertions: [{ type: 'plugin', plugin: 'required-keys', options: { keys: ['ok', 'items'] } }] }), { plugins });
    expect(result.passed).toBe(true);
    expect(result.checks[0].name).toBe('Required JSON keys');
  });
  it('rejects invalid plugin interfaces, extensions and duplicate names', async () => {
    const badFile = join(pluginDirectory, 'invalid.mjs');
    await writeFile(badFile, 'export default {name: "invalid", version: "1.0.0"};');
    await expect(loadPlugins([badFile])).rejects.toThrow(/assert/);
    await expect(loadPlugins(['plugin.js'])).rejects.toThrow(/\.mjs/);
    await expect(loadPlugins([resolve('examples/plugins/required-keys.mjs'), resolve('examples/plugins/required-keys.mjs')])).rejects.toThrow(/Duplicate/);
  });
  it('captures missing, throwing and malformed plugin checks without crashing', async () => {
    const plugins: RequestdockPlugin[] = [
      { name: 'thrower', version: '1', assert() { throw new Error('Oops'); } },
      { name: 'malformed', version: '1', assert() { return { passed: true } as never; } },
    ];
    const result = await executeRequest(spec({ assertions: ['missing', 'thrower', 'malformed'].map(plugin => ({ type: 'plugin' as const, plugin })) }), { plugins });
    expect(result.passed).toBe(false);
    expect(result.checks).toHaveLength(3);
    expect(result.checks.every(check => !check.passed)).toBe(true);
    expect(result.checks[1].message).toContain('Oops');
  });
  it('isolates plugin mutation and redacts secrets from plugin errors', async () => {
    const plugin: RequestdockPlugin = { name: 'mutator', version: '1', assert({ response }) {
      response.status = 999;
      throw new Error('private-plugin-token');
    } };
    const result = await executeRequest(spec({ assertions: [{ type: 'plugin', plugin: 'mutator' }, { type: 'status', expected: 200 }] }), {
      plugins: [plugin], variables: { token: 'private-plugin-token' },
    });
    expect(result.status).toBe(200);
    expect(result.checks[1].passed).toBe(true);
    expect(JSON.stringify(result)).not.toContain('private-plugin-token');
  });
});

describe('response comparison', () => {
  const response = (requestId: string, body: unknown, status = 200): RequestResult => ({
    requestId, name: requestId, method: 'GET', url: origin, timestamp: 'now', status,
    statusText: 'OK', durationMs: 1, headers: {}, body: JSON.stringify(body), bytes: 0, checks: [], passed: true,
  });
  it('matches by request id, ignores timing and key order, and compares parsed JSON', () => {
    const oldRun = run([response('a', { b: 2, a: 1 }), response('b', [1])]);
    const newRun = run([response('b', [1]), { ...response('a', { a: 1, b: 2 }), durationMs: 900 }]);
    expect(compareRuns(oldRun, newRun)).toEqual({ equal: true, entries: [] });
  });
  it('reports added, removed, status and nested body changes', () => {
    const oldRun = run([response('a', { value: [1], removed: true }), response('gone', {})]);
    const newRun = run([response('a', { value: [2], added: true }, 201), response('new', {})]);
    const diff = compareRuns(oldRun, newRun);
    expect(diff.equal).toBe(false);
    expect(diff.entries).toContainEqual({ path: 'requests["a"].status', kind: 'changed', before: 200, after: 201 });
    expect(diff.entries).toContainEqual({ path: 'requests["a"].body.value[0]', kind: 'changed', before: 1, after: 2 });
    expect(diff.entries.some(entry => entry.kind === 'removed' && entry.path === 'requests["gone"]')).toBe(true);
    expect(diff.entries.some(entry => entry.kind === 'added' && entry.path === 'requests["new"]')).toBe(true);
  });
  it('ignores paths relative to every body, including array indexes and complete subtrees', () => {
    const oldRun = run([response('a', { timestamp: 1, metadata: { version: 1 }, list: [1, 3] })]);
    const newRun = run([response('a', { timestamp: 2, metadata: { version: 2 }, list: [2, 3] })]);
    expect(compareRuns(oldRun, newRun, ['$.timestamp', 'metadata', 'list[0]']).equal).toBe(true);
    expect(compareRuns(oldRun, newRun, ['$']).equal).toBe(true);
    expect(() => compareRuns(oldRun, newRun, ['$..broken'])).toThrow(/Invalid JSON path/);
  });
  it('compares text and malformed JSON without crashing', () => {
    const oldRun = run([{ ...response('a', {}), body: '{invalid' }]);
    const newRun = run([{ ...response('a', {}), body: '{different' }]);
    expect(compareRuns(oldRun, newRun).entries).toEqual([{ path: 'requests["a"].body', kind: 'changed', before: '{invalid', after: '{different' }]);
    expect(compareRuns(run([response('a', null)]), run([response('a', [1])])).equal).toBe(false);
  });
  it('distinguishes an empty success from a transport failure after the same HTTP status', () => {
    const successful = { ...response('a', {}), body: '' };
    const failed = { ...successful, passed: false, error: 'Request timed out after 30 ms' };
    expect(compareRuns(run([successful]), run([failed])).entries).toEqual([
      { path: 'requests["a"].error', kind: 'added', after: 'Request timed out after 30 ms' },
    ]);
  });
});

describe('JSON paths', () => {
  it('never follows object prototype properties', () => {
    expect(readJsonPath({}, 'constructor')).toEqual({ found: false, value: undefined });
    expect(readJsonPath({}, '__proto__.toString').found).toBe(false);
    expect(jsonPathTokens('$[0].name')).toEqual(['0', 'name']);
    expect(() => jsonPathTokens('items.[0]')).toThrow();
  });
});
