import type { Collection } from './shared/types.js';
export function demoCollection(port = 4310): Collection {
  return {
    version: 1, name: 'Getting started', variables: { baseUrl: `http://127.0.0.1:${port}` },
    requests: [{ id: 'demo-health', name: 'Check the demo API', method: 'GET', url: '{{baseUrl}}/api/demo', headers: { Accept: 'application/json' }, assertions: [{ type: 'status', expected: 200 }, { type: 'json', path: '$.ok', expected: true }, { type: 'time', maxMs: 2000 }] }]
  };
}
