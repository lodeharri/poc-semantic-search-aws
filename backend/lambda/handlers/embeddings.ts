/**
 * Embeddings handler — POST /embeddings
 *
 * Pure function: parses + validates the request body, delegates to the use case,
 * formats the response. The use case handles business logic (embedding generation,
 * persistence).
 */
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { z } from 'zod';
import { ValidationError } from '../../src/domain/errors/app-error.js';
import type { HandlersBag } from '../serving.js';

const EmbeddingRequestSchema = z.object({
  content: z.string().min(1).max(8000),
  metadata: z.record(z.unknown()).optional(),
});

export async function handleCreateEmbedding(
  event: APIGatewayProxyEventV2,
  requestId: string,
  useCases: HandlersBag,
): Promise<APIGatewayProxyStructuredResultV2> {
  let body: Record<string, unknown> = {};
  if (event.body) {
    try {
      body = JSON.parse(event.body);
    } catch {
      throw new ValidationError('Invalid JSON in request body');
    }
  }

  const parsed = EmbeddingRequestSchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError('Invalid request body', parsed.error.flatten());
  }

  const document = await useCases.create.execute(parsed.data);

  return {
    statusCode: 201,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: document.id,
      content: document.content,
      embedding_dim: document.embedding.length,
      created_at: document.createdAt.toISOString(),
    }),
  };
}
