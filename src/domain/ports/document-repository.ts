/**
 * DocumentRepository port — abstraction for document persistence.
 * Any adapter (Neon, DynamoDB, in-memory) can implement this interface.
 */
import type { Document, CreateDocumentInput } from '../entities/document.js';

export interface DocumentRepository {
  /**
   * Persists a new document with its embedding.
   * @param input - The document creation input
   * @returns Promise resolving to the created Document
   */
  save(input: CreateDocumentInput): Promise<Document>;
}

export const DOCUMENT_REPOSITORY = Symbol.for('DocumentRepository');
