import pino from 'pino';
import { env } from './config/env.js';
import { getRequestContext } from './context.js';

/**
 * Structured logger — emits JSON to stdout, which Lambda forwards to CloudWatch Logs.
 *
 * Why pino?
 * - Fastest JSON logger in Node.js (https://github.com/pinojs/pino/blob/main/docs/benchmarks.md).
 * - Output is already JSON, so CloudWatch Logs Insights parses it without a transform.
 * - `mixin` is the canonical way to inject request-scoped context into every log.
 *
 * Why the mixin?
 * - We don't want every call site to repeat `{ requestId, correlationId }`.
 * - The mixin reads from AsyncLocalStorage, so any code inside runWithRequestContext()
 *   gets the context automatically — including handlers, use cases, and repositories.
 *
 * Reading logs in CloudWatch:
 *   `{ $.level = "error" && $.method = "POST" }` returns all error logs for POST requests.
 *   `{ $.requestId = "abc-123" }` returns the full lifecycle of a single request.
 *   `{ $.correlationId = "xyz-789" }` returns the lifecycle across multiple services.
 */
export const logger = pino({
  level: env.LOG_LEVEL,
  base: {
    env: env.NODE_ENV,
    service: 'poc-semantic-search',
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  mixin: () => {
    const ctx = getRequestContext();
    if (!ctx) return {};
    return {
      requestId: ctx.requestId,
      correlationId: ctx.correlationId,
    };
  },
});
