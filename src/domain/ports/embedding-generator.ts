/**
 * EmbeddingOptions — optional configuration for embedding generation.
 * Allows callers to specify task type for better similarity scoring.
 */
export interface EmbeddingOptions {
  /**
   * Gemini task type for the embedding.
   * - RETRIEVAL_DOCUMENT: for indexing stored documents (default)
   * - RETRIEVAL_QUERY: for search queries (optimized for similarity)
   * - RETRIEVAL_FAQ: for FAQ matching
   */
  readonly taskType?: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY' | 'RETRIEVAL_FAQ';
}

/**
 * EmbeddingGenerator port — abstraction for any embedding generation service.
 * Any adapter (Gemini, OpenAI, local model) can implement this interface.
 */
export interface EmbeddingGenerator {
  /**
   * Generates an embedding vector for the given text.
   * @param text - The text content to embed
   * @param options - Optional configuration (e.g., task type for Gemini)
   * @returns Promise resolving to an array of embedding values
   */
  generate(text: string, options?: EmbeddingOptions): Promise<number[]>;
}

export const EMBEDDING_GENERATOR = Symbol.for('EmbeddingGenerator');
