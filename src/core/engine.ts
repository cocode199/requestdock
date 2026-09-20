import { randomUUID } from 'node:crypto';
import type { Assertion, CheckResult, Collection, RequestdockPlugin, RequestResult, RequestSpec, RunResult } from '../shared/types.js';
import { deepEqual, readJsonPath } from './paths.js';
import { validatePlugin } from './plugins.js';
import { MAX_REQUEST_BODY_BYTES, MAX_RESPONSE_BYTES, parseCollection, parseRequest } from './schema.js';

export interface ExecutionOptions { variables?: Record<string, string>; plugins?: RequestdockPlugin[] }
export const MAX_RUN_REPORT_BYTES = 16 * 1024 * 1024;
// All skipped entries are counted up front; leave space for one bounded failure entry.
const RUN_FAILURE_HEADROOM_BYTES = 4 * 1024;
const sensitiveName = /token|secret|password|api.?key|authorization|cookie/i;
const display = (value: unknown): string => {
  try { return JSON.stringify(value)?.slice(0, 1000) ?? String(value); } catch { return '[unserializable]'; }
};
const errorMessage = (error: unknown): string => error instanceof Error ? error.message : String(error);

function collectCookieSecret(pair: string, secrets: Set<string>): void {
  const separator = pair.indexOf('=');
  if (separator < 1) return;
  const value = pair.slice(separator + 1).trim();
  // Some servers quote cookie values but echo the unquoted credential.
  secrets.add(value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value);
}

function collectHeaderSecrets(headers: Record<string, string>, secrets: Set<string>): void {
  for (const [name, value] of Object.entries(headers)) {
    if (!sensitiveName.test(name)) continue;
    secrets.add(value);
    // Servers often echo the credential without the authentication scheme.
    if (/authorization$/i.test(name)) {
      const credential = /^(?:Bearer|Basic|Token)\s+(.+)$/i.exec(value)?.[1];
      if (credential) secrets.add(credential);
    }
    if (/^cookie$/i.test(name)) {
      for (const pair of value.split(';')) collectCookieSecret(pair.trim(), secrets);
    } else if (/^set-cookie$/i.test(name)) {
      // Attributes such as Path and Expires are not credentials.
      collectCookieSecret(value.split(';', 1)[0], secrets);
    }
  }
}

function collectUrlSecrets(value: string, secrets: Set<string>): void {
  try {
    const url = new URL(value);
    url.searchParams.forEach((value, name) => { if (sensitiveName.test(name)) secrets.add(value); });
    if (url.password) {
      secrets.add(url.password);
      try { secrets.add(decodeURIComponent(url.password)); } catch { /* Preserve the encoded representation. */ }
    }
  } catch { /* Invalid URLs are reported by request validation / execution. */ }
}

export function interpolate(template: string, variables: Record<string, string>): string {
  const pattern = /\{\{\s*([^{}]+?)\s*\}\}/g;
  const withoutPlaceholders = template.replace(pattern, '');
  if (withoutPlaceholders.includes('{{') || withoutPlaceholders.includes('}}')) throw new Error('Invalid or unresolved variable placeholder');
  return template.replace(pattern, (_match, name: string) => {
    if (!Object.hasOwn(variables, name)) throw new Error(`Undefined variable: ${name}`);
    if (typeof variables[name] !== 'string') throw new Error(`Variable ${name} must be a string`);
    return variables[name];
  });
}

function redactResult(result: RequestResult, secretValues: Set<string>): RequestResult {
  // Protect literal values and common representations in JSON strings / query strings.
  const representations = [...secretValues].filter(Boolean).flatMap(value => {
    let encoded = value;
    try { encoded = encodeURIComponent(value); } catch { /* Lone Unicode surrogates have no URI encoding. */ }
    return [value, JSON.stringify(value).slice(1, -1), encoded, encoded.replace(/%20/g, '+')];
  });
  const secrets = [...new Set(representations)].sort((a, b) => b.length - a.length);
  const redact = (value: string) => secrets.reduce((text, secret) => text.split(secret).join('[REDACTED]'), value);
  return {
    ...result,
    name: redact(result.name), url: redact(result.url), statusText: redact(result.statusText), body: redact(result.body),
    headers: Object.fromEntries(Object.entries(result.headers).map(([name, value]) => [name, sensitiveName.test(name) ? '[REDACTED]' : redact(value)])),
    checks: result.checks.map(check => ({ ...check, name: redact(check.name), message: redact(check.message) })),
    ...(result.error === undefined ? {} : { error: redact(result.error) }),
  };
}

async function checkAssertion(assertion: Assertion, response: RequestResult, plugins: RequestdockPlugin[]): Promise<CheckResult> {
  if (assertion.type === 'status') return {
    name: `Status is ${assertion.expected}`, passed: response.status === assertion.expected,
    message: `Expected ${assertion.expected}; received ${response.status}`,
  };
  if (assertion.type === 'header') {
    const actual = response.headers[assertion.name.toLowerCase()];
    return { name: `Header ${assertion.name}`, passed: actual === assertion.expected, message: `Expected ${display(assertion.expected)}; received ${display(actual)}` };
  }
  if (assertion.type === 'time') return {
    name: `Response within ${assertion.maxMs} ms`, passed: response.durationMs <= assertion.maxMs,
    message: `Completed in ${response.durationMs} ms; limit ${assertion.maxMs} ms`,
  };
  if (assertion.type === 'json') {
    let body: unknown;
    try { body = JSON.parse(response.body); } catch { return { name: `JSON ${assertion.path}`, passed: false, message: 'Response body is not valid JSON' }; }
    const actual = readJsonPath(body, assertion.path);
    return {
      name: `JSON ${assertion.path}`, passed: actual.found && deepEqual(actual.value, assertion.expected),
      message: actual.found ? `Expected ${display(assertion.expected)}; received ${display(actual.value)}` : `Path ${assertion.path} was not found`,
    };
  }
  const plugin = plugins.find(candidate => candidate.name === assertion.plugin);
  if (!plugin) return { name: `Plugin ${assertion.plugin}`, passed: false, message: 'Plugin is not loaded; enable it with an explicit local plugin path' };
  try {
    // Plugins see raw data to make correct assertions, but cannot mutate the saved result.
    const result = await plugin.assert({ response: structuredClone(response), options: structuredClone(assertion.options ?? {}) });
    if (!result || typeof result.name !== 'string' || typeof result.passed !== 'boolean' || typeof result.message !== 'string') {
      throw new Error('Plugin must return { name: string, passed: boolean, message: string }');
    }
    return { name: result.name.slice(0, 500), passed: result.passed, message: result.message.slice(0, 4000) };
  } catch (error) {
    return { name: `Plugin ${assertion.plugin}`, passed: false, message: `Plugin failed: ${errorMessage(error)}` };
  }
}

export async function executeRequest(input: RequestSpec, options: ExecutionOptions = {}): Promise<RequestResult> {
  const started = performance.now();
  const variables = options.variables ?? {};
  const secrets = new Set(Object.entries(variables).filter(([name]) => sensitiveName.test(name)).map(([, value]) => value));
  collectUrlSecrets(input.url, secrets);
  collectHeaderSecrets(input.headers ?? {}, secrets);
  const result: RequestResult = {
    requestId: input.id, name: input.name, method: input.method, url: input.url, timestamp: new Date().toISOString(),
    status: 0, statusText: '', durationMs: 0, headers: {}, body: '', bytes: 0, checks: [], passed: false,
  };
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  const controller = new AbortController();
  try {
    const request = parseRequest(input);
    const plugins = options.plugins ?? [];
    const pluginNames = new Set<string>();
    for (const plugin of plugins) {
      validatePlugin(plugin);
      if (pluginNames.has(plugin.name)) throw new Error(`Duplicate plugin name: ${plugin.name}`);
      pluginNames.add(plugin.name);
    }
    result.url = interpolate(request.url, variables);
    collectUrlSecrets(result.url, secrets);
    const url = new URL(result.url);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Only HTTP and HTTPS URLs are supported');
    if (url.username || url.password) throw new Error('Embedded URL credentials are not supported; use an Authorization header');
    const headers = Object.fromEntries(Object.entries(request.headers).map(([name, value]) => [name, interpolate(value, variables)]));
    collectHeaderSecrets(headers, secrets);
    const body = request.body === undefined ? undefined : interpolate(request.body, variables);
    if (body !== undefined && new TextEncoder().encode(body).byteLength > MAX_REQUEST_BODY_BYTES) throw new Error('Expanded request body exceeds 1 MiB');
    const timeoutMs = request.timeoutMs ?? 10000;
    timeout = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    const response = await fetch(url, {
      method: request.method, headers, ...(body ? { body } : {}), signal: controller.signal, redirect: 'manual',
    });
    result.status = response.status;
    result.statusText = response.statusText;
    response.headers.forEach((value, name) => { result.headers[name] = value; });
    collectHeaderSecrets(result.headers, secrets);
    // Read Set-Cookie separately: the combined header can contain Expires commas.
    for (const cookie of response.headers.getSetCookie()) collectCookieSecret(cookie.split(';', 1)[0], secrets);
    if (response.body) {
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          result.bytes += chunk.value.byteLength;
          if (result.bytes > MAX_RESPONSE_BYTES) {
            controller.abort();
            await reader.cancel().catch(() => undefined);
            throw new Error('Response exceeds the 2 MiB limit');
          }
          chunks.push(chunk.value);
        }
      } finally { reader.releaseLock(); }
      const bodyBytes = new Uint8Array(result.bytes);
      let offset = 0;
      for (const chunk of chunks) { bodyBytes.set(chunk, offset); offset += chunk.byteLength; }
      result.body = new TextDecoder().decode(bodyBytes);
    }
    clearTimeout(timeout);
    timeout = undefined;
    result.durationMs = Math.round((performance.now() - started) * 100) / 100;
    for (const assertion of request.assertions) result.checks.push(await checkAssertion(assertion, result, plugins));
    result.passed = result.checks.every(check => check.passed);
  } catch (error) {
    result.error = timedOut ? `Request timed out after ${input.timeoutMs ?? 10000} ms` : errorMessage(error);
    result.checks.push({ name: 'Request execution', passed: false, message: result.error });
    result.durationMs = Math.round((performance.now() - started) * 100) / 100;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
  return redactResult(result, secrets);
}

export async function runCollection(input: Collection, options: ExecutionOptions = {}): Promise<RunResult> {
  const collection = parseCollection(input);
  const timestamp = new Date().toISOString();
  const skippedError = 'Not sent: the run report exceeded the 16 MiB limit.';
  const run: RunResult = {
    id: randomUUID(), collectionName: collection.name, timestamp, passed: false,
    results: collection.requests.map(request => ({
      requestId: request.id, name: 'Skipped request', method: request.method, url: '', timestamp,
      status: 0, statusText: '', durationMs: 0, headers: {}, body: '', bytes: 0,
      checks: [{ name: 'Run report size limit', passed: false, message: skippedError }], passed: false, error: skippedError,
    })),
  };
  const variables = { ...collection.variables, ...options.variables };
  const serializedBytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value), 'utf8');
  // Include the run envelope, separators, and every not-yet-executed request's metadata.
  let reportBytes = serializedBytes(run);
  for (const [index, request] of collection.requests.entries()) {
    const result = await executeRequest(request, { ...options, variables });
    const candidateBytes = reportBytes - serializedBytes(run.results[index]) + serializedBytes(result);
    if (candidateBytes > MAX_RUN_REPORT_BYTES - RUN_FAILURE_HEADROOM_BYTES) {
      const error = 'Run report exceeds the 16 MiB limit; this response was omitted and remaining requests were not sent.';
      run.results[index] = {
        ...result, name: result.name.slice(0, 200), url: '', statusText: '', body: '', headers: {},
        checks: [{ name: 'Run report size limit', passed: false, message: error }], passed: false, error,
      };
      break;
    }
    run.results[index] = result;
    reportBytes = candidateBytes;
  }
  run.passed = run.results.every(result => result.passed);
  return run;
}
