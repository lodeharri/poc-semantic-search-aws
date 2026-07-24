/**
 * Lambda Serving handler — Poc_semantic_search PoC.
 *
 * What this file does:
 * 1. Composition root: instantiates adapters and use cases, wires them together
 * 2. Dispatch: looks up the route in the route table and calls the handler
 * 3. Error handling: maps domain errors → HTTP status codes
 *
 * What this file does NOT do:
 * - Handle CORS — the CDK stack configures CORS on the Lambda Function URL,
 *   which intercepts preflight (OPTIONS) and adds the right headers to all
 *   responses. We do NOT set CORS headers here to avoid duplication
 *   (mixing them with the Function URL's would produce invalid headers like
 *   `*, http://localhost:5173`).
 * - Validate request bodies (the handlers do, with Zod)
 * - Contain any business logic (the use cases do)
 * - Implement any endpoint (the handlers do)
 */
import { randomUUID } from 'node:crypto';
import { logger } from '../src/infrastructure/logger.js';
import { GeminiEmbeddingGenerator } from '../src/infrastructure/llm/gemini-embedding-generator.js';
import { NeonDocumentRepository } from '../src/infrastructure/db/repositories/neon-document-repository.js';
import { NeonDocumentSearcher } from '../src/infrastructure/db/repositories/neon-document-searcher.js';
import { getNeonClient } from '../src/infrastructure/db/client.js';
import { CreateEmbeddingUseCase } from '../src/application/use-cases/create-embedding.js';
import { SearchSimilarUseCase } from '../src/application/use-cases/search-similar.js';
import { ListDocumentsUseCase } from '../src/application/use-cases/list-documents.js';
import { AppError, ValidationError } from '../src/domain/errors/app-error.js';
import { routes } from './routes.js';

// =============== Composition root ===============

/**
 * HandlersBag — the dependency container passed to every route handler.
 * Handlers are pure functions; they receive what they need as arguments.
 */
export interface HandlersBag {
  create: CreateEmbeddingUseCase;
  search: SearchSimilarUseCase;
  list: ListDocumentsUseCase;
  dbClient: typeof getNeonClient;
}

// IMPORTANT: generator is shared (singleton) between both use cases
const defaultGenerator = new GeminiEmbeddingGenerator();
const defaultRepository = new NeonDocumentRepository();
const defaultSearcher = new NeonDocumentSearcher();

let useCases: HandlersBag = {
  create: new CreateEmbeddingUseCase(defaultGenerator, defaultRepository, logger),
  search: new SearchSimilarUseCase(defaultGenerator, defaultSearcher, logger),
  list: new ListDocumentsUseCase(defaultRepository, logger),
  dbClient: getNeonClient,
};

/**
 * Test seam — lets tests override the use cases without rebuilding the module.
 * Kept for backward compatibility with existing tests.
 */
export function setUseCasesForTesting(overrides: Partial<HandlersBag>): void {
  useCases = { ...useCases, ...overrides };
}

// =============== Dispatch ===============

export const handler = async (event: unknown): Promise<{
  statusCode: number;
  body: string;
  headers?: Record<string, string | number | boolean>;
}> => {
  const requestId = randomUUID();
  const httpEvent = event as {
    requestContext?: { http?: { method?: string }; requestId?: string };
    httpMethod?: string;
    rawPath?: string;
    path?: string;
  };
  const method = httpEvent.requestContext?.http?.method ?? httpEvent.httpMethod ?? 'GET';
  const path = httpEvent.rawPath ?? httpEvent.path ?? '/';

  logger.info({ requestId, method, path }, 'request received');

  // CORS is handled by the Lambda Function URL config in the CDK stack.
  // We do NOT handle OPTIONS here — the Function URL intercepts preflight
  // and adds CORS headers to every response automatically.

  try {
    const route = routes.find((r) => r.method === method && r.path === path);
    if (!route) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'Not Found', method, path, requestId }),
      };
    }

    // Use the requestId from the requestContext if available (API Gateway / Function URL)
    const effectiveRequestId = httpEvent.requestContext?.requestId ?? requestId;

    const handlerResponse = await route.handler(
      event as Parameters<typeof route.handler>[0],
      effectiveRequestId,
      useCases,
    );

    // Return the handler's response as-is. The Lambda Function URL will add
    // CORS headers on the way out. Do NOT set headers here.
    return {
      statusCode: handlerResponse.statusCode ?? 500,
      headers: handlerResponse.headers,
      body: handlerResponse.body ?? '',
    };
  } catch (err) {
    return handleError(err, requestId);
  }
};

function handleError(err: unknown, requestId: string) {
  if (err instanceof ValidationError) {
    logger.warn({ requestId, err }, 'validation error');
    return {
      statusCode: 400,
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
      body: JSON.stringify({ error: err.message, code: err.code, requestId }),
    };
  }

  logger.error({ requestId, err }, 'unexpected error');
  return {
    statusCode: 500,
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
