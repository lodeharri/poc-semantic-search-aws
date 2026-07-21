/**
 * SearchResult — pure domain entity representing a document match from semantic search.
 * Contains the document data plus computed similarity score.
 */
export interface SearchResult {
  readonly id: string;
  readonly content: string;
  /** Cosine similarity score (0..1). Higher = more similar. */
  readonly similarity: number;
  readonly metadata?: Record<string, unknown> | null;
  readonly createdAt: Date;
}
