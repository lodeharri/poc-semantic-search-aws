import { SearchSimilarUseCase } from '../../../../src/application/use-cases/search-similar.js';
import { ValidationError } from '../../../../src/domain/errors/app-error.js';
import {
  mockEmbeddingGenerator,
  mockDocumentSearcher,
  silentLogger,
} from '../../_helpers/mock-helpers.js';

describe('SearchSimilarUseCase', () => {
  const baseDeps = () => ({
    generator: mockEmbeddingGenerator(),
    searcher: mockDocumentSearcher(),
    logger: silentLogger(),
  });

  it('uses RETRIEVAL_QUERY task type for search (not DOCUMENT)', async () => {
    const deps = {
      generator: mockEmbeddingGenerator({
        generate: async (_text: string, opts?: { taskType?: string }) => {
          expect(opts?.taskType).toBe('RETRIEVAL_QUERY');
          return new Array(1536).fill(0.2);
        },
      }),
      searcher: mockDocumentSearcher(),
      logger: silentLogger(),
    };
    const useCase = new SearchSimilarUseCase(deps.generator, deps.searcher, deps.logger);
    await useCase.execute({ query: 'mascotas' });
    expect(deps.generator.generate).toHaveBeenCalledOnce();
  });

  it('rejects empty query', async () => {
    const { generator, searcher, logger } = baseDeps();
    const useCase = new SearchSimilarUseCase(generator, searcher, logger);
    await expect(useCase.execute({ query: '' })).rejects.toThrow(ValidationError);
  });

  it('rejects query over 8000 chars', async () => {
    const { generator, searcher, logger } = baseDeps();
    const useCase = new SearchSimilarUseCase(generator, searcher, logger);
    const long = 'x'.repeat(8001);
    await expect(useCase.execute({ query: long })).rejects.toThrow(/exceeds max length/);
  });

  it('rejects limit < 1 or > 100', async () => {
    const { generator, searcher, logger } = baseDeps();
    const useCase = new SearchSimilarUseCase(generator, searcher, logger);
    await expect(useCase.execute({ query: 'a', limit: 0 })).rejects.toThrow(ValidationError);
    await expect(useCase.execute({ query: 'a', limit: 101 })).rejects.toThrow(ValidationError);
  });

  it('rejects threshold outside 0..1', async () => {
    const { generator, searcher, logger } = baseDeps();
    const useCase = new SearchSimilarUseCase(generator, searcher, logger);
    await expect(useCase.execute({ query: 'a', threshold: -0.1 })).rejects.toThrow(ValidationError);
    await expect(useCase.execute({ query: 'a', threshold: 1.1 })).rejects.toThrow(ValidationError);
  });

  it('returns count and results', async () => {
    const deps = {
      ...baseDeps(),
      searcher: mockDocumentSearcher({
        searchSimilar: async () => [
          {
            id: '1',
            content: 'doc 1',
            similarity: 0.85,
            metadata: undefined,
            createdAt: new Date(),
          },
          {
            id: '2',
            content: 'doc 2',
            similarity: 0.72,
            metadata: undefined,
            createdAt: new Date(),
          },
        ],
      }),
    };
    const useCase = new SearchSimilarUseCase(deps.generator, deps.searcher, deps.logger);
    const result = await useCase.execute({ query: 'mascotas' });

    expect(result.count).toBe(2);
    expect(result.results).toHaveLength(2);
    expect(result.results[0].similarity).toBeGreaterThan(result.results[1].similarity);
  });
});
