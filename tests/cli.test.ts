import { afterEach, expect, test } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { startServer } from '../src/server.js';

const exec = promisify(execFile);
const dirs: string[] = [];
afterEach(async () => { for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true }); });
const cli = (...args: string[]) => exec(process.execPath, ['--import', 'tsx', resolve('src/cli.ts'), ...args], { timeout: 10000 });
test('CLI init, real run, report compare and failure exit codes', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'requestdock-cli-')); dirs.push(dir);
  const file = join(dir, 'collection.json'), report = join(dir, 'run.json');
  await cli('init', file);
  expect((await cli('--help')).stdout).toContain('compare');
  await expect(cli('run', '--unknown')).rejects.toMatchObject({ code: 2 });
  await expect(cli('init', file)).rejects.toMatchObject({ code: 2 });
  const { server } = await startServer({ port: 0, data: join(dir, 'workspace'), seed: false });
  try {
    const address = server.address(); if (!address || typeof address === 'string') throw new Error('No port');
    const output = await cli('run', file, '--env', `baseUrl=http://127.0.0.1:${address.port}`, '--json', '--output', report);
    expect(JSON.parse(output.stdout).passed).toBe(true);
    expect(JSON.parse((await cli('compare', report, report)).stdout).equal).toBe(true);
    const collection = JSON.parse(await readFile(file, 'utf8'));
    collection.requests[0].assertions = [{ type: 'status', expected: 404 }];
    await writeFile(file, JSON.stringify(collection));
    await expect(cli('run', file, '--env', `baseUrl=http://127.0.0.1:${address.port}`, '--json')).rejects.toMatchObject({ code: 1 });
    await expect(cli('run', file, '--env', 'bad-variable')).rejects.toMatchObject({ code: 2 });
  } finally { await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }); }
}, 60000); // Several cold Node/tsx processes on Windows; each child still has its own timeout.
