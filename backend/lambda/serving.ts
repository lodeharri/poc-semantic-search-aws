/**
 * Lambda Serving handler — Poc_semantic_search PoC.
 *
 * What this file does:
 * 1. Composition root: instantiates adapters and use cases, wires them together
 * 2. Dispatch: looks up the route in the route table and calls the handler
 * 3. Error handling: maps domain errors → HTTP status codes
 * 4. Observability: builds a request context (requestId, correlationId) and wraps
 *    the handler in runWithRequestContext so every log inside the request — including
 *    use cases and repositories — automatically includes the context.
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
import {
  buildRequestContext,
  getRequestContext,
  runWithRequestContext,
} from '../src/infrastructure/context.js';
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
  // Lambda Function URL sends events with requestContext.http for HTTP-shape events.
  // We normalize to { method, path } so handlers can dispatch uniformly.
  const httpEvent = event as {
    requestContext?: { http?: { method?: string }; requestId?: string };
    httpMethod?: string;
    rawPath?: string;
    path?: string;
    headers?: Record<string, string | undefined>;
  };

  const method = httpEvent.requestContext?.http?.method ?? httpEvent.httpMethod ?? 'GET';
  const path = httpEvent.rawPath ?? httpEvent.path ?? '/';
  // X-Correlation-Id lets the client trace a request across hops. Lambda Function URL
  // normalises header names to lowercase, so we read the lowercase form.
  const correlationId = httpEvent.headers?.['x-correlation-id'];

  const ctx = buildRequestContext({
    lambdaRequestId: httpEvent.requestContext?.requestId,
    correlationId,
    method,
    path,
  });

  // Wrap the entire handler in runWithRequestContext so the logger's mixin can
  // find this context from anywhere inside the async call chain.
  return runWithRequestContext(ctx, async () => {
    const start = Date.now();
    logger.info({}, 'request received');

    // CORS is handled by the Lambda Function URL config in the CDK stack.
    // We do NOT handle OPTIONS here — the Function URL intercepts preflight
    // and adds CORS headers to every response automatically.

    try {
      const route = routes.find((r) => r.method === method && r.path === path);
      if (!route) {
        logger.warn({}, 'route not found');
        return {
          statusCode: 404,
          body: JSON.stringify({
            error: 'Not Found',
            method,
            path,
            requestId: ctx.requestId,
            correlationId: ctx.correlationId,
          }),
        };
      }

      const handlerResponse = await route.handler(
        event as Parameters<typeof route.handler>[0],
        ctx.requestId,
        useCases,
      );

      const latencyMs = Date.now() - start;
      logger.info(
        { statusCode: handlerResponse.statusCode, latencyMs },
        'request completed',
      );

      // Return the handler's response as-is. The Lambda Function URL will add
      // CORS headers on the way out. Do NOT set headers here.
      return {
        statusCode: handlerResponse.statusCode ?? 500,
        headers: handlerResponse.headers,
        body: handlerResponse.body ?? '',
      };
    } catch (err) {
      return handleError(err, start);
    }
  });
};

function handleError(err: unknown, startTime: number) {
  const latencyMs = Date.now() - startTime;
  const ctx = getRequestContext();

  if (err instanceof ValidationError) {
    logger.warn({ err, latencyMs }, 'validation error');
    return {
      statusCode: 400,
      body: JSON.stringify({
        error: err.message,
        code: err.code,
        details: err.issues,
        requestId: ctx?.requestId,
        correlationId: ctx?.correlationId,
      }),
    };
  }

  if (err instanceof AppError) {
    logger.error({ err, latencyMs }, 'application error');
    return {
      statusCode: 502,
      body: JSON.stringify({
        error: err.message,
        code: err.code,
        requestId: ctx?.requestId,
        correlationId: ctx?.correlationId,
      }),
    };
  }

  logger.error({ err, latencyMs }, 'unexpected error');
  return {
    statusCode: 500,
    body: JSON.stringify({
      error: 'Internal Server Error',
      requestId: ctx?.requestId,
      correlationId: ctx?.correlationId,
      message: err instanceof Error ? err.message : String(err),
    }),
  };
}

// Allow direct invocation via `pnpm dev`
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(
    handler({
      requestContext: { http: { method: 'GET' }, requestId: 'local-dev' },
      rawPath: '/',
      headers: { 'x-correlation-id': 'dev-correlation-id' },
    }).then(console.log),
  );
}
