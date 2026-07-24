/**
 * Search handler — POST /search
 *
 * Pure function: validates the request, delegates to the search use case.
 * Embedding generation and pgvector query are in the use case.
 */
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { z } from 'zod';
import { ValidationError } from '../../src/domain/errors/app-error.js';
import type { HandlersBag } from '../serving.js';

const SearchRequestSchema = z.object({
  query: z.string().min(1).max(8000),
  limit: z.number().int().min(1).max(100).optional().default(10),
  threshold: z.number().min(0).max(1).optional(),
});

export async function handleSearch(
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

  const parsed = SearchRequestSchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError('Invalid request body', parsed.error.flatten());
  }

  const { query, limit, threshold } = parsed.data;
  const { results, count } = await useCases.search.execute({ query, limit, threshold });

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query,
      count,
      results: results.map((r) => ({
        id: r.id,
        content: r.content,
        similarity: r.similarity,
        metadata: r.metadata,
        created_at: r.createdAt.toISOString(),
      })),
    }),
  };
}
