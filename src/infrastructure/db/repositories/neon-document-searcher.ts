/**
 * NeonDocumentSearcher — infrastructure adapter implementing DocumentSearcher port.
 * Uses @neondatabase/serverless with pgvector for cosine similarity search.
 */
import type { NeonQueryFunction } from '@neondatabase/serverless';
import { getNeonClient } from '../client.js';
import { logger } from '../../logger.js';
import { ExternalServiceError } from '../../../domain/errors/app-error.js';
import type { DocumentSearcher, SearchInput } from '../../../domain/ports/document-searcher.js';
import type { SearchResult } from '../../../domain/entities/search-result.js';

export class NeonDocumentSearcher implements DocumentSearcher {
  private readonly sql: NeonQueryFunction<false, false>;

  constructor() {
    this.sql = getNeonClient();
  }

  async searchSimilar(input: SearchInput): Promise<SearchResult[]> {
    const vectorStr = `[${input.embedding.join(',')}]`;
    const limit = Math.min(Math.max(1, input.limit), 100);

    try {
      // pgvector cosine distance: embedding <=> vector
      // Similarity = 1 - cosine_distance (distance ranges 0..2, similarity 0..1 for normalized vectors)
      const rows = await this.sql`
        SELECT
          id,
          content,
          metadata,
          created_at,
          1 - (embedding <=> ${vectorStr}::vector) AS similarity
        FROM documents
        ${
          input.threshold !== undefined
            ? this.sql`WHERE 1 - (embedding <=> ${vectorStr}::vector) >= ${input.threshold}`
            : this.sql``
        }
        ORDER BY embedding <=> ${vectorStr}::vector
        LIMIT ${limit}
      `;

      logger.info({ limit, threshold: input.threshold, count: rows.length }, 'search executed');

      return rows.map((row) => ({
        id: row.id as string,
        content: row.content as string,
        similarity: Number(row.similarity),
        metadata: (row.metadata as Record<string, unknown> | null) ?? null,
        createdAt: new Date(row.created_at as string),
      }));
    } catch (err) {
      logger.error({ err }, 'failed to search documents');
      throw new ExternalServiceError('NeonDatabase', err);
    }
  }
}
