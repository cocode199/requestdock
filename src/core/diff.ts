import type { DiffEntry, RequestResult, RunDiff, RunResult } from '../shared/types.js';
import { jsonPathTokens } from './paths.js';

function parseBody(body: string): unknown {
  try { return JSON.parse(body); } catch { return body; }
}

/** Ignore paths are rooted at each parsed response body, and ignore the complete subtree. */
export function compareRuns(baseline: RunResult, current: RunResult, ignorePaths: string[] = []): RunDiff {
  const ignored = ignorePaths.map(jsonPathTokens);
  const entries: DiffEntry[] = [];
  const before = new Map(baseline.results.map(result => [result.requestId, result]));
  const after = new Map(current.results.map(result => [result.requestId, result]));
  const snapshot = (result: RequestResult) => ({ status: result.status, body: parseBody(result.body), ...(result.error === undefined ? {} : { error: result.error }) });
  const isIgnored = (tokens: string[]) => ignored.some(path => path.length <= tokens.length && path.every((token, index) => token === tokens[index]));
  function visit(left: unknown, right: unknown, path: string, tokens: string[], leftExists = true, rightExists = true): void {
    const pending = [{ left, right, path, tokens, leftExists, rightExists }];
    while (pending.length) {
      const item = pending.pop()!;
      const { left: a, right: b } = item;
      if (isIgnored(item.tokens)) continue;
      if (!item.leftExists) { entries.push({ path: item.path, kind: 'added', after: b }); continue; }
      if (!item.rightExists) { entries.push({ path: item.path, kind: 'removed', before: a }); continue; }
      if (Object.is(a, b)) continue;
      if (a !== null && b !== null && typeof a === 'object' && typeof b === 'object' && Array.isArray(a) === Array.isArray(b)) {
        const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
        for (const key of keys.reverse()) {
          const segment = Array.isArray(a) ? `[${key}]` : /^[A-Za-z_][A-Za-z_0-9]*$/.test(key) ? `.${key}` : `[${JSON.stringify(key)}]`;
          pending.push({
            left: (a as Record<string, unknown>)[key], right: (b as Record<string, unknown>)[key],
            path: `${item.path}${segment}`, tokens: [...item.tokens, key], leftExists: Object.hasOwn(a, key), rightExists: Object.hasOwn(b, key),
          });
        }
      } else {
        entries.push({ path: item.path, kind: 'changed', before: a, after: b });
      }
    }
  }
  for (const id of new Set([...before.keys(), ...after.keys()])) {
    const left = before.get(id);
    const right = after.get(id);
    const path = `requests[${JSON.stringify(id)}]`;
    if (!left && right) entries.push({ path, kind: 'added', after: snapshot(right) });
    else if (left && !right) entries.push({ path, kind: 'removed', before: snapshot(left) });
    else if (left && right) {
      if (left.status !== right.status) entries.push({ path: `${path}.status`, kind: 'changed', before: left.status, after: right.status });
      if (left.error !== right.error) entries.push({
        path: `${path}.error`, kind: left.error === undefined ? 'added' : right.error === undefined ? 'removed' : 'changed',
        ...(left.error === undefined ? {} : { before: left.error }), ...(right.error === undefined ? {} : { after: right.error }),
      });
      visit(parseBody(left.body), parseBody(right.body), `${path}.body`, []);
    }
  }
  return { equal: entries.length === 0, entries };
}
