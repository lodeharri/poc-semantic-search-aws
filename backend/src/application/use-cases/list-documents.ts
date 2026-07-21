/**
 * ListDocumentsUseCase — retrieves recent documents without embeddings.
 *
 * Use case follows hexagonal architecture:
 * - Application layer (this file)
 * - Domain port: DocumentRepository
 * - Infrastructure adapter: NeonDocumentRepository
 */
import type { Logger } from 'pino';
import type { DocumentRepository } from '../../domain/ports/document-repository.js';
import type { Document } from '../../domain/entities/document.js';
import { ValidationError } from '../../domain/errors/app-error.js';

export interface ListDocumentsInput {
  readonly limit?: number;
}

export class ListDocumentsUseCase {
  constructor(
    private readonly repository: DocumentRepository,
    private readonly logger: Logger,
  ) {}

  async execute(input: ListDocumentsInput = {}): Promise<Document[]> {
    const limit = input.limit ?? 20;
    if (limit < 1 || limit > 100) {
      throw new ValidationError('limit must be between 1 and 100');
    }

    this.logger.info({ limit }, 'listDocuments started');
    const documents = await this.repository.findRecent({ limit });
    this.logger.info({ count: documents.length }, 'listDocuments completed');
    return documents;
  }
}
