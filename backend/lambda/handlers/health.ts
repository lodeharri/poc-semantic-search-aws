/**
 * Health check handler — GET /
 *
 * Pure function: receives dependencies via the HandlersBag, no hidden globals.
 * The handler validates the DB is reachable, pgvector is installed, and reports
 * the current document count.
 */
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { logger } from '../../src/infrastructure/logger.js';
import type { HandlersBag } from '../serving.js';

export async function handleHealthCheck(
  _event: APIGatewayProxyEventV2,
  requestId: string,
  useCases: HandlersBag,
): Promise<APIGatewayProxyStructuredResultV2> {
  try {
    const sql = await useCases.dbClient();
    const version = await sql`SELECT version()`;
    const vector = await sql`SELECT extversion FROM pg_extension WHERE extname = 'vector'`;
    const count = await sql`SELECT COUNT(*)::int FROM documents`;

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Poc_semantic_search Lambda ready (deployed via CDK)',
        postgres: version[0].version,
        pgvector: vector[0]?.extversion ?? 'not found',
        documentsCount: count[0].count,
        timestamp: new Date().toISOString(),
        requestId,
      }),
    };
  } catch (err) {
    logger.error({ err, requestId }, 'health check failed');
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Health check failed', requestId }),
    };
  }
}
