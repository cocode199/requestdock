import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { access, mkdtemp, readFile, realpath, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';

// Exercise the distributable in an independent consumer, outside the checkout.
// Use npm's JS entry point and argv arrays: no platform-specific shell quoting.
const exec = promisify(execFile);
const repository = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(await readFile(join(repository, 'package.json'), 'utf8'));
const npmEntry = process.env.npm_execpath ?? join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
await access(npmEntry).catch(() => { throw new Error('Run this check with npm run test:package so npm_execpath is available.'); });

const environment = { ...process.env };
for (const key of Object.keys(environment)) {
  if (['REQUESTDOCK_TOKEN', 'REQUESTDOCK_DATA', 'PORT', 'NODE_OPTIONS', 'NODE_PATH'].includes(key.toUpperCase())) delete environment[key];
}
const temporaryBase = await realpath(tmpdir());
const directory = await mkdtemp(join(temporaryBase, 'requestdock-package-'));
let fixture;
let application;
let applicationClosed;
let stage = 'packing';

async function command(file, args, cwd) {
  return exec(file, args, { cwd, env: environment, timeout: 180_000, maxBuffer: 4 * 1024 * 1024, windowsHide: true });
}
async function npm(args, cwd) {
  return command(process.execPath, [npmEntry, ...args], cwd);
}
async function listen(server) {
  await new Promise((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => { server.off('error', reject); resolvePromise(); });
  });
  return server.address().port;
}
async function close(server) {
  if (!server?.listening) return;
  await new Promise(resolvePromise => { server.close(resolvePromise); server.closeAllConnections(); });
}

try {
  console.log('Checking the package: build and pack, independent install, installed CLI and Web UI');
  const packed = await npm(['pack', '--json', '--pack-destination', directory], repository);
  // npm lifecycle scripts can write before the final JSON report. Its outer
  // array starts at column zero; nested arrays in the report are indented.
  const output = packed.stdout.replaceAll('\r\n', '\n');
  const reportStart = output.lastIndexOf('\n[\n');
  const metadata = JSON.parse(reportStart === -1 ? output : output.slice(reportStart + 1));
  assert.equal(metadata.length, 1, 'pack must create exactly one tarball');
  const files = new Set(metadata[0].files.map(file => file.path));
  for (const required of ['dist/cli.js', 'dist/server.js', 'dist/ui/index.html', 'LICENSE', 'THIRD_PARTY_NOTICES.md']) {
    assert.ok(files.has(required), `tarball is missing ${required}`);
  }
  assert.ok([...files].some(file => /^dist\/ui\/assets\/.+\.js$/.test(file)), 'tarball must include built UI assets');
  for (const file of files) {
    assert.ok(!/(^|\/)(\.requestdock[^/]*|\.env(?:\.[^/]*)?|\.npmrc|node_modules|test-results|playwright-report)(\/|$)/.test(file), 'tarball includes a private or generated workspace file');
  }
  assert.equal(basename(metadata[0].filename), metadata[0].filename, 'tarball filename must stay inside the temporary directory');
  const tarball = join(directory, metadata[0].filename);
  await access(tarball);
  console.log('PASS tarball contains the built CLI, UI assets, and license notices');

  stage = 'installing the tarball';
  const consumer = join(directory, 'consumer');
  await mkdir(consumer);
  await writeFile(join(consumer, 'package.json'), JSON.stringify({ name: 'requestdock-package-smoke', version: '0.0.0', private: true }));
  await npm(['install', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund', '--package-lock=false', '--prefer-offline', tarball], consumer);
  const installed = join(consumer, 'node_modules', ...manifest.name.split('/'));
  const installedManifest = JSON.parse(await readFile(join(installed, 'package.json'), 'utf8'));
  assert.equal(installedManifest.version, manifest.version);
  const bin = resolve(installed, installedManifest.bin.requestdock);
  assert.ok(bin.startsWith(installed + (process.platform === 'win32' ? '\\' : '/')), 'bin must point inside the installed package');
  await access(join(consumer, 'node_modules/.bin', process.platform === 'win32' ? 'requestdock.cmd' : 'requestdock'));
  assert.equal((await npm(['exec', '--offline', '--', 'requestdock', '--version'], consumer)).stdout.trim(), manifest.version);
  console.log('PASS installed requestdock bin resolves and reports the package version');

  stage = 'running the installed CLI against a fixture API';
  fixture = createServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ ok: true, source: 'installed-tarball' }));
  });
  const fixturePort = await listen(fixture);
  const collection = {
    version: 1, name: 'Package smoke', requests: [{
      id: 'fixture', name: 'Installed CLI request', method: 'GET', url: `http://127.0.0.1:${fixturePort}/fixture`,
      assertions: [{ type: 'status', expected: 200 }, { type: 'json', path: '$.source', expected: 'installed-tarball' }],
    }],
  };
  const collectionPath = join(consumer, 'fixture.json');
  await writeFile(collectionPath, JSON.stringify(collection));
  const result = JSON.parse((await command(process.execPath, [bin, 'run', collectionPath, '--json'], consumer)).stdout);
  assert.equal(result.passed, true);
  assert.equal(result.results.length, 1);
  assert.equal(result.results[0].status, 200);
  collection.requests[0].assertions = [{ type: 'status', expected: 418 }];
  await writeFile(collectionPath, JSON.stringify(collection));
  await assert.rejects(command(process.execPath, [bin, 'run', collectionPath, '--json'], consumer), error => error.code === 1);
  console.log('PASS installed CLI performs HTTP requests, evaluates assertions, and exits 1 for failed checks');

  stage = 'starting the installed Web UI';
  // The public CLI accepts ports 1..65535. Reserve a free local port, then hand
  // it to the child immediately; no fixed port or running developer app is used.
  const reservation = createServer();
  const appPort = await listen(reservation);
  await close(reservation);
  application = spawn(process.execPath, [bin, 'serve', '--host', '127.0.0.1', '--port', String(appPort), '--data', join(directory, 'workspace')], {
    cwd: consumer, env: environment, stdio: 'ignore', windowsHide: true,
  });
  let startupError;
  application.on('error', error => { startupError = error; });
  applicationClosed = new Promise(resolvePromise => application.once('close', resolvePromise));
  const base = `http://127.0.0.1:${appPort}`;
  const deadline = Date.now() + 30_000;
  let ready = false;
  while (Date.now() < deadline) {
    assert.ok(!startupError && application.exitCode === null && application.signalCode === null, 'installed server exited before becoming ready');
    try { ready = (await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(500) })).ok; } catch { /* Startup is still in progress. */ }
    if (ready) break;
    await delay(100);
  }
  assert.ok(ready, 'installed server did not become ready within 30 seconds');
  const page = await fetch(base);
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /id="root"/);
  const assets = [...html.matchAll(/(?:src|href)="([^"\s]+\.(?:js|css))"/g)].map(match => match[1]);
  assert.ok(assets.some(asset => asset.endsWith('.js')), 'built page must reference JavaScript');
  for (const asset of assets) {
    const url = new URL(asset, base);
    assert.equal(url.origin, base, 'UI assets must be served by the installed application');
    const response = await fetch(url);
    assert.equal(response.status, 200, 'installed UI asset is missing');
    assert.ok((await response.text()).length > 0, 'installed UI asset must not be empty');
  }
  const info = await fetch(`${base}/api/info`);
  assert.equal(info.status, 200);
  assert.equal((await info.json()).version, manifest.version);
  console.log('PASS installed server serves the Web UI, JavaScript/CSS assets, and API');
  console.log(`Package smoke passed on ${process.platform} with Node ${process.version}.`);
} catch (error) {
  // npm may use a developer's private registry configuration. Keep captured npm
  // logs and the inherited environment out of public CI/user-facing output.
  console.error(`Package smoke failed while ${stage}: ${error instanceof assert.AssertionError ? error.message : `${error.name ?? 'Error'} (${error.code ?? error.signal ?? 'unknown'})`}`);
  process.exitCode = 1;
} finally {
  if (application && application.exitCode === null && application.signalCode === null) application.kill('SIGTERM');
  if (applicationClosed) {
    const forceStop = setTimeout(() => application.kill('SIGKILL'), 5_000);
    forceStop.unref();
    await applicationClosed;
    clearTimeout(forceStop);
  }
  await close(fixture);
  assert.equal(dirname(directory), temporaryBase, 'cleanup must remain within the selected temporary directory');
  assert.ok(basename(directory).startsWith('requestdock-package-'));
  await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}
