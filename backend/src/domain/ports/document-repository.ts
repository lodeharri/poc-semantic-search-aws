/**
 * DocumentRepository port — abstraction for document persistence.
 * Any adapter (Neon, DynamoDB, in-memory) can implement this interface.
 */
import type { Document, CreateDocumentInput } from '../entities/document.js';

export interface ListRecentInput {
  readonly limit: number; // 1..100
}

export interface DocumentRepository {
  /**
   * Persists a new document with its embedding.
   * @param input - The document creation input
   * @returns Promise resolving to the created Document
   */
  save(input: CreateDocumentInput): Promise<Document>;

  /**
   * Retrieves the most recent documents ordered by creation time descending.
   * @param input - Contains the limit (1..100)
   * @returns Promise resolving to an array of Documents (without embeddings for payload optimization)
   */
  findRecent(input: ListRecentInput): Promise<Document[]>;
}

export const DOCUMENT_REPOSITORY = Symbol.for('DocumentRepository');
