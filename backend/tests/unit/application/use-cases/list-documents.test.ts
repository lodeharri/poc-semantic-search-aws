import { ListDocumentsUseCase } from '../../../../src/application/use-cases/list-documents.js';
import { ValidationError } from '../../../../src/domain/errors/app-error.js';
import { mockDocumentRepository, silentLogger } from '../../_helpers/mock-helpers.js';

describe('ListDocumentsUseCase', () => {
  it('defaults limit to 20', async () => {
    const repo = mockDocumentRepository({
      findRecent: vi.fn(async ({ limit }) => {
        expect(limit).toBe(20);
        return [];
      }),
    });
    const useCase = new ListDocumentsUseCase(repo, silentLogger());
    await useCase.execute();
  });

  it('rejects limit > 100', async () => {
    const useCase = new ListDocumentsUseCase(mockDocumentRepository(), silentLogger());
    await expect(useCase.execute({ limit: 101 })).rejects.toThrow(ValidationError);
  });

  it('returns documents from repository', async () => {
    const docs = [
      {
        id: 'a',
        content: 'first',
        embedding: [],
        metadata: undefined,
        createdAt: new Date('2026-01-02'),
      },
      {
        id: 'b',
        content: 'second',
        embedding: [],
        metadata: undefined,
        createdAt: new Date('2026-01-01'),
      },
    ];
    const repo = mockDocumentRepository({
      findRecent: async () => docs,
    });
    const useCase = new ListDocumentsUseCase(repo, silentLogger());
    const result = await useCase.execute({ limit: 10 });
    expect(result).toEqual(docs);
  });
});
