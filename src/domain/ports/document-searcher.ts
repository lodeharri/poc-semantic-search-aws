/**
 * DocumentSearcher port — abstraction for semantic document search.
 * SEPARATE from DocumentRepository to respect Interface Segregation Principle.
 * Any adapter (Neon/pgvector, Pinecone, Weaviate) can implement this interface.
 */
import type { SearchResult } from '../entities/search-result.js';

/**
 * Input for similarity search operation.
 */
export interface SearchInput {
  /** Pre-computed embedding vector from the search query */
  readonly embedding: number[];
  /** Maximum number of results to return (1..100) */
  readonly limit: number;
  /** Minimum similarity threshold (0..1). Optional — no filtering if omitted. */
  readonly threshold?: number;
}

/**
 * DocumentSearcher interface — implements the searchSimilar operation.
 */
export interface DocumentSearcher {
  /**
   * Searches for documents similar to the given embedding.
   * @param input - Search input containing embedding, limit, and optional threshold
   * @returns Promise resolving to array of SearchResult sorted by similarity descending
   */
  searchSimilar(input: SearchInput): Promise<SearchResult[]>;
}

export const DOCUMENT_SEARCHER = Symbol.for('DocumentSearcher');
