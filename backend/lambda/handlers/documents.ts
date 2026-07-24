/**
 * Documents list handler — GET /documents
 *
 * Pure function: validates query params, delegates to the list use case.
 * Embeddings are stripped from the response (payload optimization, handled by the repo).
 */
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { z } from 'zod';
import { ValidationError } from '../../src/domain/errors/app-error.js';
import type { HandlersBag } from '../serving.js';

const ListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

export async function handleListDocuments(
  event: APIGatewayProxyEventV2,
  _requestId: string,
  useCases: HandlersBag,
): Promise<APIGatewayProxyStructuredResultV2> {
  const queryParams = event.queryStringParameters ?? {};
  const parsed = ListQuerySchema.safeParse(queryParams);
  if (!parsed.success) {
    throw new ValidationError('Invalid query parameters', parsed.error.flatten());
  }

  const documents = await useCases.list.execute({ limit: parsed.data.limit });

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      count: documents.length,
      documents: documents.map((d) => ({
        id: d.id,
        content: d.content,
        metadata: d.metadata,
        created_at: d.createdAt.toISOString(),
      })),
    }),
  };
}
