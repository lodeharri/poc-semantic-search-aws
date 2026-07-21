import pino from 'pino';
import { env } from './config/env.js';

export const logger = pino({
  level: env.LOG_LEVEL,
  // No transport — JSON nativo que CloudWatch parsea perfecto.
  // Para logs bonitos en local: pnpm dev | pino-pretty
  base: {
    env: env.NODE_ENV,
    service: 'poc-semantic-search',
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});
