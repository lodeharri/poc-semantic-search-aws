/**
 * Lambda Serving handler — Poc_semantic_search PoC MVP.
 *
 * Routes:
 *   GET  /                -> health check (verifies DB + pgvector)
 *   POST /embeddings      -> creates document with Gemini embedding
 *   POST /search          -> semantic search with cosine similarity
 *
 * Hexagonal composition root: dependencies injected manually at module level.
 * This keeps the Lambda cold-start fast while allowing unit testing of adapters.
 */
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { env } from '../src/infrastructure/config/env.js';
import { logger } from '../src/infrastructure/logger.js';
import { GeminiEmbeddingGenerator } from '../src/infrastructure/llm/gemini-embedding-generator.js';
import { NeonDocumentRepository } from '../src/infrastructure/db/repositories/neon-document-repository.js';
import { NeonDocumentSearcher } from '../src/infrastructure/db/repositories/neon-document-searcher.js';
import { CreateEmbeddingUseCase } from '../src/application/use-cases/create-embedding.js';
import { SearchSimilarUseCase } from '../src/application/use-cases/search-similar.js';
import { AppError, ValidationError } from '../src/domain/errors/app-error.js';

// ===== Composition root — manual dependency injection =====
// IMPORTANT: generator is shared (singleton) between both use cases
const generator = new GeminiEmbeddingGenerator();
const repository = new NeonDocumentRepository();
const searcher = new NeonDocumentSearcher();
const createUseCase = new CreateEmbeddingUseCase(generator, repository, logger);
const searchUseCase = new SearchSimilarUseCase(generator, searcher, logger); // <- reuses generator

// ===== Request schemas =====
const EmbeddingRequestSchema = z.object({
  content: z.string().min(1).max(8000),
  metadata: z.record(z.unknown()).optional(),
});

const SearchRequestSchema = z.object({
  query: z.string().min(1).max(8000),
  limit: z.number().int().min(1).max(100).optional().default(10),
  threshold: z.number().min(0).max(1).optional(),
});

// ===== Types =====
interface LambdaResponse {
  statusCode: number;
  body: string;
  headers?: Record<string, string>;
}

// PoC: Function URL uses auth NONE, so CORS is open.
// TODO: Restrict to known origins in production.
// eslint-disable-next-line @typescript-eslint/naming-convention
const corsHeaders = {
  'Content-Type': 'application/json',
  /* PoC: open CORS for auth NONE Function URL */
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// ===== Router =====
export const handler = async (event: unknown): Promise<LambdaResponse> => {
  const requestId = randomUUID();
  const httpEvent = event as {
    requestContext?: { http?: { method?: string } };
    httpMethod?: string;
    rawPath?: string;
    path?: string;
    body?: string;
  };
  const method = httpEvent.requestContext?.http?.method ?? httpEvent.httpMethod ?? 'GET';
  const path = httpEvent.rawPath ?? httpEvent.path ?? '/';

  logger.info({ requestId, method, path }, 'request received');

  // CORS preflight
  if (method === 'OPTIONS') {
    return { statusCode: 204, body: '', headers: corsHeaders };
  }

  try {
    // GET / — health check
    if (method === 'GET' && (path === '/' || path === '')) {
      return await handleHealthCheck(requestId);
    }

    // POST /embeddings
    if (method === 'POST' && path === '/embeddings') {
      return await handleCreateEmbedding(httpEvent, requestId);
    }

    // POST /search — semantic search with cosine similarity
    if (method === 'POST' && path === '/search') {
      return await handleSearch(httpEvent, requestId);
    }

    return {
      statusCode: 404,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Not Found', method, path }),
    };
  } catch (err) {
    return handleError(err, requestId);
  }
};

async function handleHealthCheck(requestId: string): Promise<LambdaResponse> {
  try {
    const sql = neon(env.DATABASE_URL);

    const version = await sql`SELECT version()`;
    const vector = await sql`SELECT extversion FROM pg_extension WHERE extname = 'vector'`;
    const count = await sql`SELECT COUNT(*)::int FROM documents`;

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        message: 'Poc_semantic_search Lambda ready (deployed via CDK)',
        postgres: version[0].version,
        pgvector: vector[0]?.extversion ?? 'not found',
        documentsCount: count[0].count,
        timestamp: new Date().toISOString(),
        requestId,
      }),
    };
  } catch (err) {
    logger.error({ err, requestId }, 'health check failed');
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Health check failed', requestId }),
    };
  }
}

async function handleCreateEmbedding(
  event: { body?: string },
  _requestId: string,
): Promise<LambdaResponse> {
  let body: Record<string, unknown> = {};
  if (event.body) {
    try {
      body = JSON.parse(event.body);
    } catch {
      throw new ValidationError('Invalid JSON in request body');
    }
  }
  const parsed = EmbeddingRequestSchema.safeParse(body);

  if (!parsed.success) {
    throw new ValidationError('Invalid request body', parsed.error.flatten());
  }

  const document = await createUseCase.execute(parsed.data);

  return {
    statusCode: 201,
    headers: corsHeaders,
    body: JSON.stringify({
      id: document.id,
      content: document.content,
      embedding_dim: document.embedding.length,
      created_at: document.createdAt.toISOString(),
    }),
  };
}

async function handleSearch(event: { body?: string }, _requestId: string): Promise<LambdaResponse> {
  let body: Record<string, unknown> = {};
  if (event.body) {
    try {
      body = JSON.parse(event.body);
    } catch {
      throw new ValidationError('Invalid JSON in request body');
    }
  }
  const parsed = SearchRequestSchema.safeParse(body);

  if (!parsed.success) {
    throw new ValidationError('Invalid request body', parsed.error.flatten());
  }

  const { query, limit, threshold } = parsed.data;
  const { results, count } = await searchUseCase.execute({ query, limit, threshold });

  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify({
      query,
      count,
      results: results.map((r) => ({
        id: r.id,
        content: r.content,
        similarity: r.similarity,
        metadata: r.metadata,
        created_at: r.createdAt.toISOString(),
      })),
    }),
  };
}

function handleError(err: unknown, requestId: string): LambdaResponse {
  if (err instanceof ValidationError) {
    logger.warn({ requestId, err }, 'validation error');
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({
        error: err.message,
        code: err.code,
        details: err.issues,
        requestId,
      }),
    };
  }

  if (err instanceof AppError) {
    logger.error({ requestId, err }, 'application error');
    return {
      statusCode: 502,
      headers: corsHeaders,
      body: JSON.stringify({ error: err.message, code: err.code, requestId }),
    };
  }

  logger.error({ requestId, err }, 'unexpected error');
  return {
    statusCode: 500,
    headers: corsHeaders,
    body: JSON.stringify({
      error: 'Internal Server Error',
      requestId,
      message: err instanceof Error ? err.message : String(err),
    }),
  };
}

// Allow direct invocation via `pnpm dev`
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(
    handler({ requestContext: { http: { method: 'GET' } }, rawPath: '/' }).then(console.log),
  );
}
