/**
 * Manual mock factories for domain ports.
 * No external mocking libraries — vi.fn() spies where needed.
 */
import { vi } from 'vitest';
import type { EmbeddingGenerator } from '../../../src/domain/ports/embedding-generator.js';
import type { DocumentRepository } from '../../../src/domain/ports/document-repository.js';
import type { DocumentSearcher } from '../../../src/domain/ports/document-searcher.js';
import type { Document } from '../../../src/domain/entities/document.js';
import type { SearchResult } from '../../../src/domain/entities/search-result.js';
import type { Logger } from 'pino';

export function mockEmbeddingGenerator(impl?: Partial<EmbeddingGenerator>): EmbeddingGenerator {
  const defaultFn = vi.fn(async () => new Array(1536).fill(0.1));
  const generate = impl?.generate ? vi.fn(impl.generate) : defaultFn;
  return { generate };
}

export function mockDocumentRepository(impl?: Partial<DocumentRepository>): DocumentRepository {
  const defaultSave = vi.fn(async (input): Promise<Document> => ({
    id: 'test-uuid',
    content: input.content,
    embedding: input.embedding,
    metadata: input.metadata,
    createdAt: new Date('2026-01-01T00:00:00Z'),
  }));
  const defaultFindRecent = vi.fn(async () => []);
  return {
    save: impl?.save ? vi.fn(impl.save) : defaultSave,
    findRecent: impl?.findRecent ? vi.fn(impl.findRecent) : defaultFindRecent,
  };
}

export function mockDocumentSearcher(impl?: Partial<DocumentSearcher>): DocumentSearcher {
  const defaultSearch = vi.fn(async (): Promise<SearchResult[]> => []);
  return {
    searchSimilar: impl?.searchSimilar ? vi.fn(impl.searchSimilar) : defaultSearch,
  };
}

/** Silent pino logger mock — all methods are no-ops */
export function silentLogger(): Logger {
  const noop = () => {};
  return {
    info: noop,
    warn: noop,
    error: noop,
    debug: noop,
    trace: noop,
    fatal: noop,
    child: () => silentLogger(),
    level: 'silent',
  } as unknown as Logger;
}
