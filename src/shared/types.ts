export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';
export type Assertion =
  | { type: 'status'; expected: number }
  | { type: 'json'; path: string; expected: unknown }
  | { type: 'header'; name: string; expected: string }
  | { type: 'time'; maxMs: number }
  | { type: 'plugin'; plugin: string; options?: Record<string, unknown> };
export interface RequestSpec {
  id: string; name: string; method: HttpMethod; url: string;
  headers: Record<string, string>; body?: string; timeoutMs?: number; assertions: Assertion[];
}
export interface Collection {
  version: 1; name: string; variables: Record<string, string>; requests: RequestSpec[];
}
export interface SavedCollection { id: string; collection: Collection; updatedAt: string }
export interface CheckResult { name: string; passed: boolean; message: string }
export interface RequestResult {
  requestId: string; name: string; method: HttpMethod; url: string; timestamp: string;
  status: number; statusText: string; durationMs: number; headers: Record<string, string>;
  body: string; bytes: number; checks: CheckResult[]; passed: boolean; error?: string;
}
export interface RunResult { id: string; collectionName: string; timestamp: string; passed: boolean; results: RequestResult[] }
export interface DiffEntry { path: string; kind: 'added' | 'removed' | 'changed'; before?: unknown; after?: unknown }
export interface RunDiff { equal: boolean; entries: DiffEntry[] }
export interface RequestdockPlugin {
  name: string; version: string;
  assert: (context: { response: RequestResult; options: Record<string, unknown> }) => CheckResult | Promise<CheckResult>;
}
