import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, extname, sep } from 'node:path';
import { z } from 'zod';
import { Workspace } from './store.js';
import { demoCollection } from './demo.js';
import { parseCollection } from './core/schema.js';
import { runCollection } from './core/engine.js';
import { compareRuns } from './core/diff.js';
import { importCollection } from './importer.js';
import type { RequestdockPlugin, RunResult } from './shared/types.js';

export interface ServerOptions { host?: string; port?: number; data?: string; token?: string; plugins?: RequestdockPlugin[]; seed?: boolean; uiDirectory?: string }
const loopback = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
const variableSchema = z.record(z.string().max(200), z.string().max(10000));
const compareResultSchema = z.object({
  id: z.string(), collectionName: z.string(), timestamp: z.string(), passed: z.boolean(),
  results: z.array(z.object({ requestId: z.string(), status: z.number(), body: z.string(), error: z.string().optional() }).passthrough()).max(100)
}).passthrough();
function sameToken(actual: string, expected: string) {
  const a = Buffer.from(actual), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
async function body(req: IncomingMessage): Promise<unknown> {
  if (!req.headers['content-type']?.toLowerCase().startsWith('application/json')) throw Object.assign(new Error('Content-Type must be application/json'), { status: 415 });
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 4 * 1024 * 1024) throw Object.assign(new Error('Request body exceeds 4 MiB'), { status: 413 });
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new Error('Invalid JSON body'); }
}
function json(res: ServerResponse, code: number, value: unknown) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(value));
}

export async function createApp(options: ServerOptions = {}) {
  const host = options.host ?? '127.0.0.1';
  if (!loopback.has(host) && (!options.token || options.token.length < 24)) throw new Error('Non-loopback binding requires REQUESTDOCK_TOKEN with at least 24 characters');
  const store = new Workspace(resolve(options.data ?? '.requestdock'));
  await store.init();
  if (options.seed !== false && !(await store.collections()).length) await store.save(demoCollection(options.port ?? 4310));
  const ui = options.uiDirectory ?? fileURLToPath(new URL('./ui/', import.meta.url));
  const plugins = options.plugins ?? [];
  let activeRuns = 0;
  const server = createHttpServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    try {
      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
      const path = url.pathname;
      if (loopback.has(host) && !loopback.has(url.hostname)) return json(res, 403, { error: 'Untrusted Host header' });
      if (path === '/api/health' && req.method === 'GET') return json(res, 200, { ok: true });
      if (path.startsWith('/api/')) {
        const forwardedSecure = req.socket && 'encrypted' in req.socket && req.socket.encrypted;
        const expectedOrigins = new Set([url.origin, `${forwardedSecure ? 'https' : 'http'}://${req.headers.host}`]);
        // TLS reverse proxies preserve the original Host. Only accept HTTPS with that same authority.
        expectedOrigins.add(`https://${req.headers.host}`);
        if (req.headers['sec-fetch-site'] === 'cross-site' || (req.headers.origin && !expectedOrigins.has(req.headers.origin))) return json(res, 403, { error: 'Cross-origin API requests are blocked' });
        if (path === '/api/demo' && (req.method === 'GET' || req.method === 'POST')) return json(res, 200, { service: 'RequestDock demo', ok: true, version: 1 });
        if (options.token && !sameToken(req.headers.authorization ?? '', `Bearer ${options.token}`)) return json(res, 401, { error: 'Enter the server access token to continue' });
      }
      if (path === '/api/info' && req.method === 'GET') return json(res, 200, { name: 'RequestDock', version: '0.1.0', plugins: plugins.map(({ name, version }) => ({ name, version })) });
      if (path === '/api/collections' && req.method === 'GET') return json(res, 200, await store.collections());
      if (path === '/api/collections' && req.method === 'POST') return json(res, 201, await store.save(parseCollection(await body(req))));
      const collectionMatch = path.match(/^\/api\/collections\/([a-zA-Z0-9_-]{1,80})$/);
      if (collectionMatch && ['PUT', 'DELETE'].includes(req.method ?? '')) {
        const id = collectionMatch[1];
        if (!(await store.exists(id))) return json(res, 404, { error: 'Collection not found' });
        if (req.method === 'DELETE') { await store.remove(id); return json(res, 200, { ok: true }); }
        return json(res, 200, await store.save(parseCollection(await body(req)), id));
      }
      if (path === '/api/run' && req.method === 'POST') {
        const payload = z.object({ collection: z.unknown(), variables: variableSchema.optional(), requestId: z.string().optional() }).strict().parse(await body(req));
        const collection = parseCollection(payload.collection);
        if (payload.requestId) {
          collection.requests = collection.requests.filter(r => r.id === payload.requestId);
          if (!collection.requests.length) return json(res, 404, { error: 'Request not found' });
        }
        if (activeRuns >= 4) return json(res, 429, { error: 'Four runs are already active; wait and retry' });
        activeRuns++;
        try {
          const result = await runCollection(collection, { variables: payload.variables, plugins });
          await store.addRun(result);
          return json(res, 200, result);
        } finally { activeRuns--; }
      }
      if (path === '/api/history' && req.method === 'GET') return json(res, 200, await store.history());
      if (path === '/api/compare' && req.method === 'POST') {
        const payload = z.object({ baseline: compareResultSchema, current: compareResultSchema, ignorePaths: z.array(z.string().max(500)).max(100).default([]) }).strict().parse(await body(req));
        return json(res, 200, compareRuns(payload.baseline as unknown as RunResult, payload.current as unknown as RunResult, payload.ignorePaths));
      }
      if (path === '/api/import' && req.method === 'POST') return json(res, 200, importCollection(await body(req)));
      if (path.startsWith('/api/')) return json(res, 404, { error: 'API route not found' });
      if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'Method not allowed' });
      const relative = decodeURIComponent(path).replace(/^\/+/, '');
      const file = resolve(ui, relative || 'index.html');
      if (file !== resolve(ui) && !file.startsWith(resolve(ui) + sep)) return json(res, 403, { error: 'Invalid path' });
      let buffer: Buffer;
      let fileType = extname(file);
      try { buffer = await readFile(file); }
      catch {
        if (extname(relative)) return json(res, 404, { error: 'File not found' });
        try { buffer = await readFile(resolve(ui, 'index.html')); fileType = '.html'; }
        catch { return json(res, 503, { error: 'Web UI is not built. Run npm run build, or use npm run dev:ui during development.' }); }
      }
      const mime: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
      res.writeHead(200, { 'Content-Type': mime[fileType] ?? 'application/octet-stream', 'Cache-Control': fileType === '.html' ? 'no-cache' : 'public, max-age=3600' });
      res.end(req.method === 'HEAD' ? undefined : buffer);
    } catch (error) {
      if (res.headersSent) { res.end(); return; }
      if (error instanceof Error && 'code' in error && /^(EACCES|EPERM|ENOENT|ENOSPC|EROFS|EIO|EMFILE|ENFILE)$/.test(String(error.code))) {
        console.error(`Workspace I/O error: ${error.code}`);
        return json(res, 500, { error: 'Workspace storage is unavailable. Check server permissions and disk space.' });
      }
      const status = typeof (error as { status?: unknown })?.status === 'number' ? (error as { status: number }).status : 400;
      json(res, status, { error: error instanceof Error ? error.message : 'Request failed' });
    }
  });
  server.requestTimeout = 30000;
  server.headersTimeout = 10000;
  return { server, store };
}

export async function startServer(options: ServerOptions = {}) {
  const app = await createApp(options);
  await new Promise<void>((resolve, reject) => {
    app.server.once('error', reject);
    app.server.listen(options.port ?? 4310, options.host ?? '127.0.0.1', () => { app.server.off('error', reject); resolve(); });
  });
  return app;
}
