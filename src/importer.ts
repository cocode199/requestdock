import { randomUUID } from 'node:crypto';
import { parseCollection } from './core/schema.js';
import type { Collection, HttpMethod, RequestSpec } from './shared/types.js';

export function importCollection(input: unknown): { collection: Collection; warnings: string[] } {
  if (input && typeof input === 'object' && 'version' in input) return { collection: parseCollection(input), warnings: [] };
  return importPostman(input);
}

/** Read the documented Postman collection structure; never evaluate scripts. */
export function importPostman(input: unknown): { collection: Collection; warnings: string[] } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Expected a Postman collection object');
  const doc = input as Record<string, any>;
  if (!doc.info || typeof doc.info.name !== 'string' || !Array.isArray(doc.item)) throw new Error('Expected Postman collection info.name and item array');
  if (doc.info.schema && !String(doc.info.schema).includes('/v2.1.0/')) throw new Error('Only Postman collection v2.1 is supported');
  const warnings: string[] = [];
  const variables: Record<string, string> = Object.create(null);
  for (const v of doc.variable ?? []) {
    if (v && typeof v.key === 'string' && !v.disabled) variables[v.key] = String(v.value ?? '');
  }
  const requests: RequestSpec[] = [];
  const unsupported = (node: Record<string, any>, label: string) => {
    if (node.event?.length) warnings.push(`${label}: scripts were not imported or executed.`);
    if (node.auth && node.auth.type !== 'noauth') warnings.push(`${label}: authentication configuration was not imported; add headers explicitly.`);
    if (node.protocolProfileBehavior) warnings.push(`${label}: protocol settings were not imported.`);
  };
  unsupported(doc, 'Collection');
  const walk = (items: any[], parents: string[] = [], depth = 0) => {
    if (depth > 20) throw new Error('Postman folders exceed maximum depth (20)');
    for (const item of items) {
      if (!item || typeof item !== 'object') throw new Error('Invalid Postman item');
      const name = [...parents, String(item.name || 'Request')].join(' / ');
      unsupported(item, name);
      if (item.variable?.length) warnings.push(`${name}: item or folder variables were not imported.`);
      if (Array.isArray(item.item)) { walk(item.item, [...parents, String(item.name || 'Folder')], depth + 1); continue; }
      if (!item.request) throw new Error(`${name}: missing request`);
      const source = typeof item.request === 'string' ? { url: item.request, method: 'GET' } : item.request;
      unsupported(source, name);
      const rawUrl = typeof source.url === 'string' ? source.url : source.url?.raw;
      if (typeof rawUrl !== 'string') throw new Error(`${name}: URL must have a raw representation`);
      if (source.url?.variable?.length) warnings.push(`${name}: URL path variables were not imported; replace them with {{variables}}.`);
      if (source.url?.query?.some((query: { disabled?: boolean }) => query.disabled)) warnings.push(`${name}: URL was imported verbatim from raw; review disabled query parameters before running.`);
      const headers: Record<string, string> = Object.create(null);
      const headerNames = new Map<string, string>();
      if (typeof source.header === 'string') warnings.push(`${name}: string headers were not imported; add JSON headers explicitly.`);
      else for (const h of source.header ?? []) if (h && !h.disabled && typeof h.key === 'string') {
        const normalized = h.key.toLowerCase();
        const previous = headerNames.get(normalized);
        if (previous !== undefined) {
          warnings.push(`${name}: duplicate header ${h.key} was reduced to its last enabled value; review before running.`);
          delete headers[previous];
        }
        headerNames.set(normalized, h.key);
        headers[h.key] = String(h.value ?? '');
      }
      let body: string | undefined;
      if (source.body && !source.body.disabled) {
        if (source.body.mode === 'raw') {
          body = String(source.body.raw ?? '');
          if (source.body.options?.raw?.language === 'json' && !Object.keys(headers).some(k => k.toLowerCase() === 'content-type')) headers['Content-Type'] = 'application/json';
        } else warnings.push(`${name}: ${source.body.mode || 'unknown'} body was not imported; only raw bodies are supported.`);
      }
      if (item.response?.length) warnings.push(`${name}: saved responses were not imported.`);
      requests.push({ id: randomUUID(), name, method: String(source.method || 'GET').toUpperCase() as HttpMethod, url: rawUrl, headers, ...(body !== undefined ? { body } : {}), assertions: [] });
      if (requests.length > 100) throw new Error('Maximum 100 requests per collection');
    }
  };
  walk(doc.item);
  return { collection: parseCollection({ version: 1, name: doc.info.name, variables, requests }), warnings: [...new Set(warnings)] };
}
