import { afterEach, describe, expect, test } from 'vitest';
import { mkdtemp, rm, readFile, rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer } from '../src/server.js';
import { demoCollection } from '../src/demo.js';
import { Workspace } from '../src/store.js';
import { importPostman, importCollection } from '../src/importer.js';
import { request as httpRequest, type Server } from 'node:http';

const servers: Server[] = [], dirs: string[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); })));
  await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })));
});
async function setup(token?: string) {
  const data = await mkdtemp(join(tmpdir(), 'requestdock-test-')); dirs.push(data);
  const app = await startServer({ port: 0, data, token, seed: false }); servers.push(app.server);
  const address = app.server.address();
  if (!address || typeof address === 'string') throw new Error('No server port');
  const base = `http://127.0.0.1:${address.port}`;
  const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  return { ...app, data, base, headers };
}

describe('HTTP workspace', () => {
  test('storage failures return a server error without exposing local paths', async () => {
    const { base, data } = await setup();
    await rename(join(data, 'collections'), join(data, 'collections-unavailable'));
    const response = await fetch(`${base}/api/collections`);
    expect(response.status).toBe(500);
    const payload = await response.json();
    expect(payload.error).toContain('Workspace storage is unavailable');
    expect(JSON.stringify(payload)).not.toContain(data);
  });
  test('history keeps the latest twenty runs under overlapping writes', async () => {
    const { store } = await setup();
    await Promise.all(Array.from({ length: 23 }, (_, index) => store.addRun({ id: `run-${index}`, collectionName: 'retention', timestamp: new Date(index * 1000).toISOString(), passed: true, results: [] })));
    const retained = await store.history();
    expect(retained).toHaveLength(20);
    expect(retained[0].id).toBe('run-22');
    expect(retained.at(-1)?.id).toBe('run-3');
  });
  test('CRUD survives a new store instance; executes, saves and compares actual results', async () => {
    const { base, headers, data } = await setup();
    const collection = demoCollection(); collection.variables.baseUrl = base;
    const created = await fetch(`${base}/api/collections`, { method: 'POST', headers, body: JSON.stringify(collection) });
    expect(created.status).toBe(201);
    const saved = await created.json();
    const reopened = new Workspace(data);
    expect((await reopened.collections())[0].collection.name).toBe(collection.name);
    collection.name = 'Updated collection';
    expect((await fetch(`${base}/api/collections/${saved.id}`, { method: 'PUT', headers, body: JSON.stringify(collection) })).status).toBe(200);
    const executed = await fetch(`${base}/api/run`, { method: 'POST', headers, body: JSON.stringify({ collection }) });
    const run = await executed.json();
    expect(run.passed).toBe(true); expect(run.results[0].status).toBe(200);
    const history = await (await fetch(`${base}/api/history`)).json(); expect(history[0].id).toBe(run.id);
    expect(JSON.parse(await readFile(join(data, 'runs', `${run.id}.json`), 'utf8')).passed).toBe(true);
    const diff = await (await fetch(`${base}/api/compare`, { method: 'POST', headers, body: JSON.stringify({ baseline: run, current: run, ignorePaths: [] }) })).json();
    expect(diff.equal).toBe(true);
    expect((await fetch(`${base}/api/collections/${saved.id}`, { method: 'DELETE', headers })).status).toBe(200);
    expect(await reopened.collections()).toEqual([]);
    expect((await fetch(`${base}/api/collections/${saved.id}`, { method: 'DELETE', headers })).status).toBe(404);
  });

  test('blocks cross-origin mutation, DNS rebinding, bad JSON and missing credentials', async () => {
    const { base, headers } = await setup('a-long-test-token-at-least-24-characters');
    expect((await fetch(`${base}/api/collections`)).status).toBe(401);
    expect((await fetch(`${base}/api/collections`, { headers })).status).toBe(200);
    expect((await fetch(`${base}/api/collections`, { method: 'POST', headers: { ...headers, Origin: 'https://evil.example' }, body: '{}' })).status).toBe(403);
    const reboundStatus = await new Promise<number | undefined>((resolve, reject) => {
      const req = httpRequest(`${base}/api/collections`, { headers: { ...headers, Host: 'attacker.example' } }, res => { res.resume(); resolve(res.statusCode); });
      req.on('error', reject); req.end();
    });
    expect(reboundStatus).toBe(403);
    expect((await fetch(`${base}/api/collections`, { method: 'POST', headers, body: '{bad' })).status).toBe(400);
    expect((await fetch(`${base}/api/collections`, { method: 'POST', headers: { Authorization: headers.Authorization!, 'Content-Type': 'text/plain' }, body: '{}' })).status).toBe(415);
    expect((await fetch(`${base}/api/compare`, { method: 'POST', headers, body: '{}' })).status).toBe(400);
    expect((await fetch(`${base}/api/health`)).status).toBe(200);
    await expect(startServer({ host: '0.0.0.0', port: 0 })).rejects.toThrow('requires REQUESTDOCK_TOKEN');
  });

  test('reports invalid collections and request selection, and does not persist runtime secrets', async () => {
    const { base, headers, data } = await setup();
    const collection = demoCollection(); collection.variables.baseUrl = base;
    expect((await fetch(`${base}/api/collections`, { method: 'POST', headers, body: JSON.stringify({ ...collection, version: 2 }) })).status).toBe(400);
    expect((await fetch(`${base}/api/run`, { method: 'POST', headers, body: JSON.stringify({ collection, requestId: 'missing' }) })).status).toBe(404);
    collection.requests[0].url += '?token={{apiToken}}';
    const result = await (await fetch(`${base}/api/run`, { method: 'POST', headers, body: JSON.stringify({ collection, variables: { apiToken: 'test-secret-12345' } }) })).json();
    expect(result.passed).toBe(true);
    expect(JSON.stringify(result)).not.toContain('test-secret-12345');
    expect(await readFile(join(data, 'runs', `${result.id}.json`), 'utf8')).not.toContain('test-secret-12345');
  });
});

describe('Postman import', () => {
  test('warns when duplicate case-insensitive headers must be collapsed', () => {
    const result = importPostman({ info: { name: 'Migration' }, item: [{ name: 'Headers', request: { url: 'https://example.com', header: [
      { key: 'X-Example', value: 'first' }, { key: 'x-example', value: 'last' }, { key: 'X-Example', value: 'disabled', disabled: true }
    ] } }] });
    expect(result.collection.requests[0].headers).toEqual({ 'x-example': 'last' });
    expect(result.warnings).toEqual(['Headers: duplicate header x-example was reduced to its last enabled value; review before running.']);
  });
  test('native export/import roundtrip preserves collections and warns about folder variables', () => {
    expect(importCollection(demoCollection())).toEqual({ collection: demoCollection(), warnings: [] });
    const result = importPostman({ info: { name: 'x' }, item: [{ name: 'Folder', variable: [{ key: 'x', value: 'y' }], item: [{ request: { url: { raw: 'https://example.com?q=x', query: [{ key: 'q', value: 'x', disabled: true }] } } }] }] });
    expect(result.warnings).toHaveLength(2);
  });
  test('flattens folders, imports raw JSON, warns about scripts and auth', () => {
    const imported = importPostman({ info: { name: 'Migration', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' }, variable: [{ key: 'baseUrl', value: 'http://localhost' }], event: [{ script: { exec: ['throw 1'] } }], item: [{ name: 'Folder', item: [{ name: 'Create', request: { method: 'POST', url: { raw: '{{baseUrl}}/items' }, auth: { type: 'bearer' }, body: { mode: 'raw', raw: '{"ok":true}', options: { raw: { language: 'json' } } } } }] }] });
    expect(imported.collection.requests[0].name).toBe('Folder / Create');
    expect(imported.collection.requests[0].headers['Content-Type']).toBe('application/json');
    expect(imported.warnings.join(' ')).toMatch(/scripts/); expect(imported.warnings.join(' ')).toMatch(/authentication/);
    expect(imported.collection.variables.baseUrl).toBe('http://localhost');
  });
  test('rejects malformed imports; flags unsupported multipart body', () => {
    expect(() => importPostman({})).toThrow();
    expect(() => importPostman({ info: { name: 'x' }, item: [{ request: { method: 'TRACE', url: 'http://localhost' } }] })).toThrow();
    const output = importPostman({ info: { name: 'x' }, item: [{ request: { url: 'https://example.com', body: { mode: 'formdata' } } }] });
    expect(output.warnings).toHaveLength(1);
  });
});
