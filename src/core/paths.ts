/** Small, deterministic JSON path syntax: $, $.field[0], or field.0. */
export function jsonPathTokens(path: string): string[] {
  if (path === '$') return [];
  let rest = path.startsWith('$.') ? path.slice(2) : path.startsWith('$[') ? path.slice(1) : path;
  if (!rest || rest.startsWith('$')) throw new Error(`Invalid JSON path: ${path}`);
  const tokens: string[] = [];
  let needsField = true;
  while (rest) {
    if (rest.startsWith('[')) {
      const match = /^\[(0|[1-9]\d*)\]/.exec(rest);
      if (!match) throw new Error(`Invalid JSON path: ${path}`);
      tokens.push(match[1]);
      rest = rest.slice(match[0].length);
      needsField = false;
    } else if (needsField) {
      const match = /^[^.[\]\s$]+/.exec(rest);
      if (!match) throw new Error(`Invalid JSON path: ${path}`);
      tokens.push(match[0]);
      rest = rest.slice(match[0].length);
      needsField = false;
    } else {
      throw new Error(`Invalid JSON path: ${path}`);
    }
    if (rest.startsWith('.')) {
      rest = rest.slice(1);
      needsField = true;
      if (!rest || rest.startsWith('[')) throw new Error(`Invalid JSON path: ${path}`);
    } else if (rest && !rest.startsWith('[')) {
      throw new Error(`Invalid JSON path: ${path}`);
    }
  }
  return tokens;
}

export function readJsonPath(value: unknown, path: string): { found: boolean; value: unknown } {
  for (const token of jsonPathTokens(path)) {
    if (value === null || typeof value !== 'object' || !Object.hasOwn(value, token)) {
      return { found: false, value: undefined };
    }
    value = (value as Record<string, unknown>)[token];
  }
  return { found: true, value };
}

export function deepEqual(left: unknown, right: unknown): boolean {
  const pending: [unknown, unknown][] = [[left, right]];
  while (pending.length) {
    const [a, b] = pending.pop()!;
    if (Object.is(a, b)) continue;
    if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    const aKeys = Object.keys(a);
    if (aKeys.length !== Object.keys(b).length) return false;
    for (const key of aKeys) {
      if (!Object.hasOwn(b, key)) return false;
      pending.push([(a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]]);
    }
  }
  return true;
}
