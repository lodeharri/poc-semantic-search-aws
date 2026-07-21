import { pgTable, uuid, text, timestamp, customType } from 'drizzle-orm/pg-core';

/**
 * Custom vector type for pgvector(1536) columns.
 * Gemini embedding-001 outputs 1536 dimensions.
 * HNSW index supports up to 2000 dimensions, so 1536 is safe.
 *
 * Drizzle handles JSON serialization automatically for string-based types.
 */
const vector1536 = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return 'vector(1536)';
  },
});

/**
 * Documents table — stores text content with pre-computed embeddings.
 * The embedding column uses pgvector for efficient similarity search.
 */
export const documents = pgTable('documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  content: text('content').notNull(),
  embedding: vector1536('embedding').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
