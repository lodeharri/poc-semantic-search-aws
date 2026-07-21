/**
 * Document entity — pure domain object with no infrastructure dependencies.
 * Represents a text document with its pre-computed embedding vector.
 */
export interface Document {
  readonly id: string;
  readonly content: string;
  readonly embedding: number[]; // 1536 dims array from gemini-embedding-001
  readonly metadata?: Record<string, unknown>;
  readonly createdAt: Date;
}

export interface CreateDocumentInput {
  readonly content: string;
  readonly embedding: number[];
  readonly metadata?: Record<string, unknown>;
}
