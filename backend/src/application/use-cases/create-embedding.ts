/**
 * CreateEmbeddingUseCase — application service orchestrating the embedding creation flow.
 * Dependencies are injected via constructor (hexagonal ports).
 */
import type { Logger } from 'pino';
import type { EmbeddingGenerator } from '../../domain/ports/embedding-generator.js';
import type { DocumentRepository } from '../../domain/ports/document-repository.js';
import type { Document } from '../../domain/entities/document.js';
import { ValidationError } from '../../domain/errors/app-error.js';

export interface CreateEmbeddingInput {
  readonly content: string;
  readonly metadata?: Record<string, unknown>;
}

export class CreateEmbeddingUseCase {
  constructor(
    private readonly generator: EmbeddingGenerator,
    private readonly repository: DocumentRepository,
    private readonly logger: Logger,
  ) {}

  /**
   * Executes the use case:
   * 1. Validates input
   * 2. Generates embedding via LLM
   * 3. Persists document with embedding
   */
  async execute(input: CreateEmbeddingInput): Promise<Document> {
    const trimmed = input.content?.trim();
    if (!trimmed) {
      throw new ValidationError('content cannot be empty');
    }
    if (trimmed.length > 8000) {
      throw new ValidationError('content exceeds max length of 8000 chars');
    }

    this.logger.info({ content_length: trimmed.length }, 'createEmbedding started');

    // Step 1: Generate embedding from LLM
    const embedding = await this.generator.generate(trimmed);

    // Step 2: Persist document with embedding
    const document = await this.repository.save({
      content: trimmed,
      embedding,
      metadata: input.metadata,
    });

    this.logger.info({ id: document.id, dim: embedding.length }, 'createEmbedding completed');
    return document;
  }
}
