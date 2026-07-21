import { CreateEmbeddingUseCase } from '../../../../src/application/use-cases/create-embedding.js';
import { ValidationError, ExternalServiceError } from '../../../../src/domain/errors/app-error.js';
import {
  mockEmbeddingGenerator,
  mockDocumentRepository,
  silentLogger,
} from '../../_helpers/mock-helpers.js';

describe('CreateEmbeddingUseCase', () => {
  const baseDeps = () => ({
    generator: mockEmbeddingGenerator(),
    repository: mockDocumentRepository(),
    logger: silentLogger(),
  });

  it('trims content and persists', async () => {
    const deps = baseDeps();
    const useCase = new CreateEmbeddingUseCase(deps.generator, deps.repository, deps.logger);
    const result = await useCase.execute({ content: '  hello world  ' });

    expect(result.content).toBe('hello world');
    expect(deps.repository.save).toHaveBeenCalledOnce();
    const savedArg = (deps.repository.save as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(savedArg.content).toBe('hello world');
    expect(savedArg.embedding).toHaveLength(1536);
  });

  it('rejects empty content', async () => {
    const deps = baseDeps();
    const useCase = new CreateEmbeddingUseCase(deps.generator, deps.repository, deps.logger);
    await expect(useCase.execute({ content: '   ' })).rejects.toThrow(ValidationError);
    expect(deps.repository.save).not.toHaveBeenCalled();
  });

  it('rejects content over 8000 chars', async () => {
    const deps = baseDeps();
    const useCase = new CreateEmbeddingUseCase(deps.generator, deps.repository, deps.logger);
    const long = 'x'.repeat(8001);
    await expect(useCase.execute({ content: long })).rejects.toThrow(/exceeds max length/);
  });

  it('propagates ExternalServiceError when generator fails', async () => {
    const generatorErr = new Error('Gemini 502');
    const deps = {
      generator: mockEmbeddingGenerator({
        generate: async () => {
          throw new ExternalServiceError('Gemini', generatorErr);
        },
      }),
      repository: mockDocumentRepository(),
      logger: silentLogger(),
    };
    const useCase = new CreateEmbeddingUseCase(deps.generator, deps.repository, deps.logger);
    await expect(useCase.execute({ content: 'test' })).rejects.toThrow(ExternalServiceError);
    expect(deps.repository.save).not.toHaveBeenCalled();
  });

  it('passes metadata through to repository', async () => {
    const deps = baseDeps();
    const useCase = new CreateEmbeddingUseCase(deps.generator, deps.repository, deps.logger);
    await useCase.execute({ content: 'test', metadata: { topic: 'mascotas' } });

    const savedArg = (deps.repository.save as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(savedArg.metadata).toEqual({ topic: 'mascotas' });
  });
});
