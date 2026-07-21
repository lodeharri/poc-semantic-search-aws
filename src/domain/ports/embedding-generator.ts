/**
 * EmbeddingGenerator port — abstraction for any embedding generation service.
 * Any adapter (Gemini, OpenAI, local model) can implement this interface.
 */
export interface EmbeddingGenerator {
  /**
   * Generates an embedding vector for the given text.
   * @param text - The text content to embed
   * @returns Promise resolving to an array of embedding values
   */
  generate(text: string): Promise<number[]>;
}

export const EMBEDDING_GENERATOR = Symbol.for('EmbeddingGenerator');
