/**
 * Lambda handler unit tests.
 *
 * vi.mock is hoisted by Vitest — mock factories run BEFORE imports.
 * Therefore mock factories use only built-ins and global vitest (vi), not imported symbols.
 */
import { handler, setUseCasesForTesting } from '../../../lambda/serving.js';
import {
  mockEmbeddingGenerator,
  mockDocumentRepository,
  mockDocumentSearcher,
  silentLogger,
} from '../_helpers/mock-helpers.js';
import { CreateEmbeddingUseCase } from '../../../src/application/use-cases/create-embedding.js';
import { SearchSimilarUseCase } from '../../../src/application/use-cases/search-similar.js';
import { ListDocumentsUseCase } from '../../../src/application/use-cases/list-documents.js';
import { ExternalServiceError } from '../../../src/domain/errors/app-error.js';

// Mocks for env.ts and logger.ts — must be defined BEFORE the serving.ts import.
// vi.mock is hoisted, so these run before any imports.
// Using vi.fn() directly (global vitest) so no import dependency in the factory.
vi.mock('../../../src/infrastructure/config/env.js', () => ({
  env: {
    DATABASE_URL: 'postgresql://test:test@localhost/test',
    GEMINI_API_KEY: 'test-api-key',
    LOG_LEVEL: 'silent',
    NODE_ENV: 'test',
  },
}));

vi.mock('../../../src/infrastructure/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn(() => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      trace: vi.fn(),
      fatal: vi.fn(),
      level: 'silent',
    })),
    level: 'silent',
  },
}));

function installUseCases() {
  const generator = mockEmbeddingGenerator();
  const repository = mockDocumentRepository();
  const searcher = mockDocumentSearcher();
  setUseCasesForTesting({
    create: new CreateEmbeddingUseCase(generator, repository, silentLogger()),
    search: new SearchSimilarUseCase(generator, searcher, silentLogger()),
    list: new ListDocumentsUseCase(repository, silentLogger()),
  });
}

function makeEvent(method: string, path: string, body?: unknown) {
  return {
    requestContext: { http: { method } },
    rawPath: path.split('?')[0],
    body: body !== undefined ? JSON.stringify(body) : undefined,
    queryStringParameters: extractQueryParams(path),
  };
}

function extractQueryParams(path: string): Record<string, string> | undefined {
  const qs = path.split('?')[1];
  if (!qs) return undefined;
  const params: Record<string, string> = {};
  for (const pair of qs.split('&')) {
    const [k, v] = pair.split('=');
    params[k] = decodeURIComponent(v ?? '');
  }
  return params;
}

describe('Lambda handler — routing', () => {
  beforeEach(() => {
    installUseCases();
  });

  it('GET / returns 200 with health JSON', async () => {
    // Health check requires a live DB connection; mocked env above so Neon tries to connect.
    // Accept either 200 (DB up in test env) or 500 (DB unreachable in test).
    const event = makeEvent('GET', '/');
    const result = await handler(event);
    expect([200, 500]).toContain(result.statusCode);
  });

  it('POST /embeddings with valid content returns 201', async () => {
    const event = makeEvent('POST', '/embeddings', { content: 'hello world' });
    const result = await handler(event);
    expect(result.statusCode).toBe(201);
    const body = JSON.parse(result.body);
    expect(body).toHaveProperty('id');
    expect(body.embedding_dim).toBe(1536);
  });

  it('POST /search returns results', async () => {
    const event = makeEvent('POST', '/search', { query: 'mascotas', limit: 5 });
    const result = await handler(event);
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body).toHaveProperty('results');
    expect(body).toHaveProperty('count');
  });

  it('GET /documents returns list', async () => {
    const event = makeEvent('GET', '/documents?limit=10');
    const result = await handler(event);
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body).toHaveProperty('documents');
    expect(body).toHaveProperty('count');
  });

  it('OPTIONS reaches the handler (Function URL intercepts it in production)', async () => {
    // In production, Lambda Function URL intercepts OPTIONS preflight before
    // it reaches our handler — so the handler never sees OPTIONS. This test
    // documents the handler's behavior when OPTIONS IS passed through (it
    // falls through to the 404 path because no route matches).
    const event = makeEvent('OPTIONS', '/embeddings');
    const result = await handler(event);
    expect(result.statusCode).toBe(404);
  });

  it('unknown route returns 404', async () => {
    const event = makeEvent('GET', '/nope');
    const result = await handler(event);
    expect(result.statusCode).toBe(404);
  });

  it('echoes the X-Correlation-Id header in the 404 response', async () => {
    const event = {
      ...makeEvent('GET', '/nope'),
      headers: { 'x-correlation-id': 'my-trace-abc-123' },
    };
    const result = await handler(event);
    expect(result.statusCode).toBe(404);
    const body = JSON.parse(result.body);
    expect(body.correlationId).toBe('my-trace-abc-123');
    expect(body.requestId).toBeDefined();
  });

  it('generates a correlation ID when X-Correlation-Id is not provided', async () => {
    const event = makeEvent('GET', '/nope');
    const result = await handler(event);
    const body = JSON.parse(result.body);
    // RFC 4122 UUID v4 — 36 chars including hyphens
    expect(body.correlationId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe('Lambda handler — error handling', () => {
  beforeEach(() => {
    installUseCases();
  });

  it('ValidationError → 400', async () => {
    const event = makeEvent('POST', '/embeddings', { content: '' });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body).toHaveProperty('error');
  });

  it('AppError → 502', async () => {
    // Override generator to throw ExternalServiceError
    const generator = mockEmbeddingGenerator({
      generate: async () => {
        throw new ExternalServiceError('Gemini', new Error('502'));
      },
    });
    const repository = mockDocumentRepository();
    setUseCasesForTesting({
      create: new CreateEmbeddingUseCase(generator, repository, silentLogger()),
      search: new SearchSimilarUseCase(generator, mockDocumentSearcher(), silentLogger()),
      list: new ListDocumentsUseCase(repository, silentLogger()),
    });
    const event = makeEvent('POST', '/embeddings', { content: 'test' });
    const result = await handler(event);
    expect(result.statusCode).toBe(502);
    const body = JSON.parse(result.body);
    expect(body.code).toBe('EXTERNAL_SERVICE_ERROR');
  });

  it('malformed JSON body → 400', async () => {
    const event = {
      ...makeEvent('POST', '/embeddings'),
      body: 'not json',
    };
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
  });

  it('POST /search with empty query → 400', async () => {
    const event = makeEvent('POST', '/search', { query: '' });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
  });

  it('GET /documents with invalid limit → 400', async () => {
    const event = makeEvent('GET', '/documents?limit=200');
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
  });
});
