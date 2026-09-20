import { z } from 'zod';
import type { Collection, RequestSpec } from '../shared/types.js';
import { jsonPathTokens } from './paths.js';

export const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
export const MAX_REQUEST_BODY_BYTES = 1024 * 1024;
const boundedRecord = (limit: number, valueLimit: number) => z.record(z.string().min(1).max(128), z.string().max(valueLimit))
  .refine(value => Object.keys(value).length <= limit, `At most ${limit} entries are allowed`);
const jsonPath = z.string().min(1).max(512).refine(value => {
  try { jsonPathTokens(value); return true; } catch { return false; }
}, 'Use $, $.field[0], or field.0 JSON path syntax');
const identifier = z.string().min(1).max(128).regex(/^[a-zA-Z0-9_.-]+$/, 'Use letters, numbers, dots, underscores, or hyphens');
const expectedJson = z.json().refine(value => JSON.stringify(value).length <= MAX_REQUEST_BODY_BYTES, 'Expected JSON is too large');

export const assertionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('status'), expected: z.number().int().min(100).max(599) }).strict(),
  z.object({ type: z.literal('json'), path: jsonPath, expected: expectedJson }).strict(),
  z.object({ type: z.literal('header'), name: z.string().min(1).max(128), expected: z.string().max(8192) }).strict(),
  z.object({ type: z.literal('time'), maxMs: z.number().min(0).max(60000) }).strict(),
  z.object({ type: z.literal('plugin'), plugin: identifier, options: z.record(z.string(), z.json()).optional() }).strict(),
]);

export const requestSchema = z.object({
  id: identifier,
  name: z.string().trim().min(1).max(200),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']),
  url: z.string().min(1).max(8192),
  headers: boundedRecord(100, 8192).default({}),
  body: z.string().refine(value => new TextEncoder().encode(value).byteLength <= MAX_REQUEST_BODY_BYTES, 'Request body exceeds 1 MiB').optional(),
  timeoutMs: z.number().int().min(1).max(60000).optional(),
  assertions: z.array(assertionSchema).max(100).default([]),
}).strict().superRefine((request, context) => {
  if ((request.method === 'GET' || request.method === 'HEAD') && request.body !== undefined && request.body !== '') {
    context.addIssue({ code: 'custom', path: ['body'], message: 'GET and HEAD requests cannot have a body' });
  }
  if (!request.url.includes('{{')) {
    try {
      const url = new URL(request.url);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('protocol');
      if (url.username || url.password) throw new Error('credentials');
    } catch {
      context.addIssue({ code: 'custom', path: ['url'], message: 'Use an HTTP(S) URL without embedded credentials' });
    }
  }
});

export const collectionSchema = z.object({
  version: z.literal(1),
  name: z.string().trim().min(1).max(200),
  variables: boundedRecord(100, 8192).default({}),
  requests: z.array(requestSchema).min(1).max(100),
}).strict().superRefine((collection, context) => {
  const ids = new Set<string>();
  collection.requests.forEach((request, index) => {
    if (ids.has(request.id)) context.addIssue({ code: 'custom', path: ['requests', index, 'id'], message: `Duplicate request id: ${request.id}` });
    ids.add(request.id);
  });
});

export function parseCollection(input: unknown): Collection {
  return collectionSchema.parse(input) as Collection;
}

export function parseRequest(input: unknown): RequestSpec {
  return requestSchema.parse(input) as RequestSpec;
}
