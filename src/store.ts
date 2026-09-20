import { mkdir, readFile, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Collection, RunResult, SavedCollection } from './shared/types.js';
import { parseCollection } from './core/schema.js';

export const MAX_HISTORY_BYTES = 64 * 1024 * 1024;
export const MAX_HISTORY_RUNS = 20;
export interface HistoryLimits { maxBytes?: number; maxRuns?: number }
interface RunMetadata { id: string; timestamp: string; bytes: number }

export class Workspace {
  private readonly maxHistoryBytes: number;
  private readonly maxHistoryRuns: number;
  private runIndex: Map<string, RunMetadata> | undefined;
  private runQueue: Promise<void> = Promise.resolve();
  constructor(readonly directory: string, limits: HistoryLimits = {}) {
    this.maxHistoryBytes = limits.maxBytes ?? MAX_HISTORY_BYTES;
    this.maxHistoryRuns = limits.maxRuns ?? MAX_HISTORY_RUNS;
    if (!Number.isSafeInteger(this.maxHistoryBytes) || this.maxHistoryBytes < 1 || !Number.isSafeInteger(this.maxHistoryRuns) || this.maxHistoryRuns < 1) {
      throw new Error('History limits must be positive safe integers');
    }
  }
  async init() {
    await mkdir(join(this.directory, 'collections'), { recursive: true });
    await mkdir(join(this.directory, 'runs'), { recursive: true });
    await this.queueRuns(() => this.ensureRunIndex());
  }
  private path(folder: string, id: string) {
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id)) throw new Error('Invalid document id');
    return join(this.directory, folder, `${id}.json`);
  }
  private async atomic(path: string, value: unknown) {
    await this.atomicText(path, JSON.stringify(value, null, 2) + '\n');
  }
  private async atomicText(path: string, content: string) {
    const temporary = `${path}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, content, { mode: 0o600 });
      await rename(temporary, path);
    } finally { await unlink(temporary).catch(() => undefined); }
  }
  async collections(): Promise<SavedCollection[]> {
    const files = (await readdir(join(this.directory, 'collections'))).filter(f => f.endsWith('.json'));
    const rows = await Promise.all(files.map(async file => {
      const saved = JSON.parse(await readFile(join(this.directory, 'collections', file), 'utf8')) as SavedCollection;
      return { ...saved, collection: parseCollection(saved.collection) };
    }));
    return rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  async save(collection: Collection, id: string = randomUUID()): Promise<SavedCollection> {
    const saved = { id, collection: parseCollection(collection), updatedAt: new Date().toISOString() };
    await this.atomic(this.path('collections', id), saved);
    return saved;
  }
  async exists(id: string): Promise<boolean> {
    try { await readFile(this.path('collections', id)); return true; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; }
  }
  async remove(id: string) { await unlink(this.path('collections', id)); }

  private queueRuns<T>(action: () => Promise<T>): Promise<T> {
    const operation = this.runQueue.then(action);
    this.runQueue = operation.then(() => undefined, () => undefined);
    return operation;
  }
  private checkRunBytes(id: string, bytes: number): void {
    if (bytes > this.maxHistoryBytes) {
      throw new Error(`Run ${id} exceeds the history limit of ${this.maxHistoryBytes} bytes; no history was removed. Move an oversized existing file out of the runs directory before restarting.`);
    }
  }
  private metadata(run: RunResult, id: string, bytes: number): RunMetadata {
    if (!run || run.id !== id || typeof run.timestamp !== 'string' || !Array.isArray(run.results)) throw new Error(`Invalid history report: ${id}`);
    return { id, timestamp: run.timestamp, bytes };
  }
  private async ensureRunIndex(): Promise<void> {
    if (this.runIndex) return;
    const files = (await readdir(join(this.directory, 'runs'))).filter(file => file.endsWith('.json'));
    const index = new Map<string, RunMetadata>();
    // Rebuild legacy history one bounded file at a time, never loading all old bodies together.
    for (const file of files) {
      const id = file.slice(0, -5);
      const path = this.path('runs', id);
      const info = await stat(path);
      this.checkRunBytes(id, info.size);
      const content = await readFile(path, 'utf8');
      const bytes = Buffer.byteLength(content, 'utf8');
      this.checkRunBytes(id, bytes);
      index.set(id, this.metadata(JSON.parse(content) as RunResult, id, bytes));
    }
    this.runIndex = index;
    await this.pruneRuns();
  }
  private sortedRuns(): RunMetadata[] {
    return [...this.runIndex!.values()].sort((a, b) => b.timestamp.localeCompare(a.timestamp) || b.id.localeCompare(a.id));
  }
  private async pruneRuns(): Promise<void> {
    let bytes = 0, count = 0, full = false;
    for (const run of this.sortedRuns()) {
      // Keep one continuous newest prefix; do not substitute smaller, older reports.
      if (!full && count < this.maxHistoryRuns && bytes + run.bytes <= this.maxHistoryBytes) {
        count++;
        bytes += run.bytes;
        continue;
      }
      full = true;
      try { await unlink(this.path('runs', run.id)); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      this.runIndex!.delete(run.id);
    }
  }
  async addRun(run: RunResult): Promise<void> {
    return this.queueRuns(async () => {
      const path = this.path('runs', run.id);
      const content = JSON.stringify(run) + '\n';
      const bytes = Buffer.byteLength(content, 'utf8');
      this.checkRunBytes(run.id, bytes);
      const metadata = this.metadata(run, run.id, bytes);
      await this.ensureRunIndex();
      await this.atomicText(path, content);
      this.runIndex!.set(run.id, metadata);
      await this.pruneRuns();
    });
  }
  async history(): Promise<RunResult[]> {
    return this.queueRuns(async () => {
      await this.ensureRunIndex();
      await this.pruneRuns();
      const rows: RunResult[] = [];
      for (const run of this.sortedRuns()) rows.push(JSON.parse(await readFile(this.path('runs', run.id), 'utf8')) as RunResult);
      return rows;
    });
  }
}
