import { env } from './infrastructure/config/env.js';
import { logger } from './infrastructure/logger.js';

export const handler = (): { statusCode: number; body: string } => {
  logger.info({ env: env.NODE_ENV }, 'Lambda cold start');
  return { statusCode: 200, body: 'Poc_semantic_search lambda ready' };
};

// Allow direct invocation via `pnpm dev`
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(handler().body);
}
