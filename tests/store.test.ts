import { afterEach, describe, expect, test } from 'vitest';
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MAX_HISTORY_BYTES, MAX_HISTORY_RUNS, Workspace, type HistoryLimits } from '../src/store.js';
import type { RunResult } from '../src/shared/types.js';

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })));
});
async function workspace(limits: HistoryLimits = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'requestdock-store-'));
  directories.push(directory);
  const store = new Workspace(directory, limits);
  await store.init();
  return { directory, store };
}
const run = (id: string, seconds: number, body = ''): RunResult => ({
  id, collectionName: 'Storage fixture', timestamp: new Date(seconds * 1000).toISOString(), passed: true,
  results: [{
    requestId: 'request', name: 'Request', method: 'GET', url: 'https://example.test',
    timestamp: new Date(seconds * 1000).toISOString(), status: 200, statusText: 'OK',
    durationMs: 1, headers: {}, body, bytes: Buffer.byteLength(body), checks: [], passed: true,
  }],
});
const compact = (value: RunResult) => JSON.stringify(value) + '\n';
const bytes = (value: RunResult) => Buffer.byteLength(compact(value), 'utf8');
async function diskBytes(directory: string) {
  const files = (await readdir(join(directory, 'runs'))).filter(file => file.endsWith('.json'));
  const sizes = await Promise.all(files.map(async file => (await stat(join(directory, 'runs', file))).size));
  return sizes.reduce((sum, size) => sum + size, 0);
}

describe('bounded history storage', () => {
  test('enforces the default limits and measures compact JSON in UTF-8 bytes', async () => {
    expect(MAX_HISTORY_RUNS).toBe(20);
    expect(MAX_HISTORY_BYTES).toBe(64 * 1024 * 1024);
    const reports = [run('run-0', 0, '界'.repeat(300)), run('run-1', 1, '界'.repeat(300)), run('run-2', 2, '界'.repeat(300))];
    const maxBytes = bytes(reports[1]) + bytes(reports[2]);
    const { directory, store } = await workspace({ maxBytes });
    await Promise.all(reports.map(report => store.addRun(report)));
    expect((await store.history()).map(report => report.id)).toEqual(['run-2', 'run-1']);
    expect(await diskBytes(directory)).toBe(maxBytes);
    expect(await readFile(join(directory, 'runs', 'run-2.json'), 'utf8')).toBe(compact(reports[2]));
  });

  test('keeps a continuous newest prefix rather than filling gaps with older reports', async () => {
    const newest = run('newest', 3, 'n'.repeat(100));
    const middle = run('middle', 2, 'm'.repeat(400));
    const oldest = run('oldest', 1, 'o');
    const maxBytes = bytes(newest) + bytes(middle) - 1;
    const { directory, store } = await workspace({ maxBytes });
    await store.addRun(oldest);
    await store.addRun(middle);
    await store.addRun(newest);
    expect((await store.history()).map(report => report.id)).toEqual(['newest']);
    expect(await diskBytes(directory)).toBe(bytes(newest));
  });

  test('serializes overlapping reads and writes and honors the count limit', async () => {
    const { store } = await workspace({ maxRuns: 2 });
    const writes: Promise<void>[] = [], reads: Promise<RunResult[]>[] = [];
    for (let index = 0; index < 8; index++) {
      writes.push(store.addRun(run(`run-${index}`, index)));
      reads.push(store.history());
    }
    await Promise.all(writes);
    const snapshots = await Promise.all(reads);
    expect(snapshots.map(snapshot => snapshot.map(report => report.id))).toEqual(
      Array.from({ length: 8 }, (_, index) => index === 0 ? ['run-0'] : [`run-${index}`, `run-${index - 1}`]),
    );
    expect((await store.history()).map(report => report.id)).toEqual(['run-7', 'run-6']);
  });

  test('accounts for same-id replacements and rejects oversized writes without losing existing reports', async () => {
    const first = run('first', 1, 'a');
    const initial = run('same-id', 2, 'b');
    const replacement = run('same-id', 3, '界'.repeat(100));
    const maxBytes = bytes(first) + bytes(replacement);
    const { directory, store } = await workspace({ maxBytes });
    await store.addRun(first);
    await store.addRun(initial);
    await store.addRun(replacement);
    expect(await store.history()).toEqual([replacement, first]);
    expect(await diskBytes(directory)).toBe(maxBytes);
    const oversized = run('same-id', 4, 'x'.repeat(maxBytes));
    await expect(store.addRun(oversized)).rejects.toThrow(/exceeds the history limit/);
    expect(await store.history()).toEqual([replacement, first]);
    expect(await readFile(join(directory, 'runs', 'same-id.json'), 'utf8')).toBe(compact(replacement));
  });

  test('rebuilds and prunes legacy pretty-printed history before serving it', async () => {
    const { directory } = await workspace();
    const reports = [run('oldest', 1), run('middle', 2), run('newest', 3)];
    const pretty = reports.map(report => JSON.stringify(report, null, 2) + '\n');
    for (const [index, report] of reports.entries()) await writeFile(join(directory, 'runs', `${report.id}.json`), pretty[index]);
    const maxBytes = Buffer.byteLength(pretty[1] + pretty[2]);
    const reopened = new Workspace(directory, { maxBytes });
    await reopened.init();
    expect(await reopened.history()).toEqual([reports[2], reports[1]]);
    expect(await diskBytes(directory)).toBe(maxBytes);
    expect(await readdir(join(directory, 'runs'))).not.toContain('oldest.json');
  });

  test('rejects oversized legacy files using their disk size before parsing and leaves them intact', async () => {
    const { directory } = await workspace();
    const path = join(directory, 'runs', 'oversized.json');
    await writeFile(path, 'not-json'.repeat(100));
    const reopened = new Workspace(directory, { maxBytes: 100 });
    await expect(reopened.init()).rejects.toThrow(/oversized exceeds the history limit of 100 bytes/);
    expect((await stat(path)).size).toBe(800);
    expect(() => new Workspace(directory, { maxRuns: 0 })).toThrow(/positive safe integers/);
  });
});
