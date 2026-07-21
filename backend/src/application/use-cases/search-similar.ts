/**
 * SearchSimilarUseCase — application service for semantic document search.
 * Orchestrates: generate query embedding -> search similar documents.
 * Follows Single Responsibility: dedicated to search logic only.
 */
import type { Logger } from 'pino';
import type { EmbeddingGenerator } from '../../domain/ports/embedding-generator.js';
import type { DocumentSearcher } from '../../domain/ports/document-searcher.js';
import type { SearchResult } from '../../domain/entities/search-result.js';
import { ValidationError } from '../../domain/errors/app-error.js';

export interface SearchSimilarInput {
  readonly query: string;
  readonly limit?: number;
  readonly threshold?: number;
}

export interface SearchSimilarOutput {
  readonly results: SearchResult[];
  readonly count: number;
}

export class SearchSimilarUseCase {
  constructor(
    private readonly generator: EmbeddingGenerator,
    private readonly searcher: DocumentSearcher,
    private readonly logger: Logger,
  ) {}

  /**
   * Executes semantic search:
   * 1. Validates input
   * 2. Generates embedding for the query (using RETRIEVAL_QUERY task type)
   * 3. Searches for similar documents
   */
  async execute(input: SearchSimilarInput): Promise<SearchSimilarOutput> {
    // Validation
    const trimmed = input.query?.trim();
    if (!trimmed) throw new ValidationError('query cannot be empty');
    if (trimmed.length > 8000) {
      throw new ValidationError('query exceeds max length of 8000 chars');
    }
    const limit = input.limit ?? 10;
    if (limit < 1 || limit > 100) {
      throw new ValidationError('limit must be between 1 and 100');
    }
    if (input.threshold !== undefined && (input.threshold < 0 || input.threshold > 1)) {
      throw new ValidationError('threshold must be between 0 and 1');
    }

    this.logger.info(
      { query_length: trimmed.length, limit, threshold: input.threshold },
      'searchSimilar started',
    );

    // Step 1: Generate embedding for QUERY (RETRIEVAL_QUERY = optimized for similarity search)
    const embedding = await this.generator.generate(trimmed, { taskType: 'RETRIEVAL_QUERY' });

    // Step 2: Search for similar documents
    const results = await this.searcher.searchSimilar({
      embedding,
      limit,
      threshold: input.threshold,
    });

    this.logger.info({ count: results.length }, 'searchSimilar completed');

    return { results, count: results.length };
  }
}
