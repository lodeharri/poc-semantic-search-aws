/**
 * Request context — extracted once per invocation, available everywhere via AsyncLocalStorage.
 *
 * Why AsyncLocalStorage?
 * - Lambda is single-threaded but async; context must propagate through await chains.
 * - Without ALS, we'd have to thread `ctx` through every function signature (handlers,
 *   use cases, repositories, LLM adapters).
 * - ALS is the standard Node.js pattern used by Express middleware, OpenTelemetry, Datadog
 *   tracer, etc. — reviewers and interviewers recognise it.
 * - Magic-free: the only access points are getRequestContext() and the logger mixin().
 *
 * Tradeoffs:
 * - Performance: ~0.1ms per ALS access. Negligible at this scale.
 * - Memory: ~few bytes per request. Negligible.
 * - Cognitive: new devs need to know context "just exists" inside runWithRequestContext().
 *
 * Why NOT just pass ctx as a parameter?
 * - The current use cases are constructed once at module load and expose methods like
 *   `execute(input)`. Passing ctx would require changing every method signature for no
 *   real benefit. ALS keeps the signatures clean.
 * - This is the same trade-off OpenTelemetry makes with its Context API.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

export interface RequestContext {
  /** AWS Lambda request ID (from event.requestContext.requestId). */
  requestId: string;
  /** X-Correlation-Id from client, or generated if absent. Used to trace across hops. */
  correlationId: string;
  method: string;
  path: string;
  /** Date.now() at the start of the request, for latency tracking. */
  startedAt: number;
}

const storage = new AsyncLocalStorage<RequestContext>();

/**
 * Run `fn` inside a request context. Anything inside (including async code) can call
 * getRequestContext() to retrieve the context. This is the entry point — wrap the
 * entire handler in this.
 */
export function runWithRequestContext<T>(ctx: RequestContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

/**
 * Returns the current request context, or undefined if called outside a run() block.
 * Use this in the logger mixin to auto-enrich every log entry.
 */
export function getRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

/**
 * Builds a RequestContext from an incoming Lambda event.
 * - requestId: AWS Lambda's unique ID (used in CloudWatch Logs Insights `requestId` field).
 * - correlationId: client's X-Correlation-Id header (for tracing across services).
 * - method/path: for quick filtering in logs.
 */
export function buildRequestContext(input: {
  lambdaRequestId?: string;
  correlationId?: string;
  method: string;
  path: string;
}): RequestContext {
  return {
    requestId: input.lambdaRequestId ?? randomUUID(),
    correlationId: input.correlationId ?? randomUUID(),
    method: input.method,
    path: input.path,
    startedAt: Date.now(),
  };
}
