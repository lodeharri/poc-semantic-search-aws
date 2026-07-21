/**
 * NeonDocumentRepository — infrastructure adapter implementing DocumentRepository port.
 * Uses @neondatabase/serverless for direct SQL access with pgvector support.
 */
import { randomUUID } from 'node:crypto';
import type { NeonQueryFunction } from '@neondatabase/serverless';
import { getNeonClient } from '../client.js';
import { logger } from '../../logger.js';
import type { Document, CreateDocumentInput } from '../../../domain/entities/document.js';
import type {
  DocumentRepository,
  ListRecentInput,
} from '../../../domain/ports/document-repository.js';
import { ExternalServiceError } from '../../../domain/errors/app-error.js';

export class NeonDocumentRepository implements DocumentRepository {
  private readonly sql: NeonQueryFunction<false, false>;

  constructor() {
    this.sql = getNeonClient();
  }

  async save(input: CreateDocumentInput): Promise<Document> {
    const id = randomUUID();
    const createdAt = new Date();

    // pgvector requires vector as string format: '[0.1,0.2,0.3]'
    const vectorStr = `[${input.embedding.join(',')}]`;

    try {
      const result = await this.sql`
        INSERT INTO documents (id, content, embedding, metadata, created_at)
        VALUES (
          ${id}::uuid,
          ${input.content},
          ${vectorStr}::vector,
          ${input.metadata ?? null}::jsonb,
          ${createdAt.toISOString()}::timestamp
        )
        RETURNING id, content, metadata, created_at
      `;

      logger.info(
        { id, content_length: input.content.length, embedding_dim: input.embedding.length },
        'document saved',
      );

      return {
        id: result[0].id,
        content: result[0].content,
        embedding: input.embedding,
        metadata: (result[0].metadata as Record<string, unknown> | null) ?? undefined,
        createdAt,
      };
    } catch (err) {
      logger.error({ err, id }, 'failed to save document');
      throw new ExternalServiceError('NeonDatabase', err);
    }
  }

  async findRecent(input: ListRecentInput): Promise<Document[]> {
    const limit = Math.min(Math.max(1, input.limit), 100);

    try {
      const rows = await this.sql`
SELECT id, content, metadata, created_at
FROM documents
ORDER BY created_at DESC
LIMIT ${limit}
      `;

      logger.info({ limit, count: rows.length }, 'documents listed');

      return rows.map((row) => ({
        id: row.id as string,
        content: row.content as string,
        embedding: [], // No embedding returned (payload optimization)
        metadata: (row.metadata as Record<string, unknown> | null) ?? undefined,
        createdAt: new Date(row.created_at as string),
      }));
    } catch (err) {
      logger.error({ err }, 'failed to list documents');
      throw new ExternalServiceError('NeonDatabase', err);
    }
  }
}
