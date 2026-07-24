/**
 * Route table — declarative mapping of HTTP method + path to handler.
 *
 * This is the ONLY place where routes are defined. The handler in serving.ts
 * just looks up the entry and dispatches — no logic here.
 *
 * Why a table?
 * - Single source of truth (one file to scan when reviewing the API)
 * - Adding a new endpoint = add one row, no central switch to edit
 * - Trivial to grep, generate OpenAPI from, or move to API Gateway later
 * - Forces handlers to be pure (lives in handlers/, not inlined here)
 *
 * Why `as const`?
 * - Preserves literal types so TypeScript can validate path/method strings
 * - Makes the array `readonly` — routes can't be mutated at runtime
 */
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import type { HandlersBag } from './serving.js';
import { handleHealthCheck } from './handlers/health.js';
import { handleCreateEmbedding } from './handlers/embeddings.js';
import { handleSearch } from './handlers/search.js';
import { handleListDocuments } from './handlers/documents.js';

/**
 * APIGatewayProxyStructuredResultV2 is the object form of the response
 * (statusCode, headers, body). It's what Lambda Function URL expects.
 * We use this instead of the union `APIGatewayProxyResultV2` which also
 * includes a raw-string form we never use.
 */
export type RouteHandler = (
  event: APIGatewayProxyEventV2,
  requestId: string,
  useCases: HandlersBag,
) => Promise<APIGatewayProxyStructuredResultV2>;

export interface Route {
  method: string;
  path: string;
  handler: RouteHandler;
}

export const routes: readonly Route[] = [
  { method: 'GET', path: '/', handler: handleHealthCheck },
  { method: 'POST', path: '/embeddings', handler: handleCreateEmbedding },
  { method: 'POST', path: '/search', handler: handleSearch },
  { method: 'GET', path: '/documents', handler: handleListDocuments },
] as const;
