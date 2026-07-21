import { neon } from '@neondatabase/serverless';
import type { NeonQueryFunction } from '@neondatabase/serverless';
import { env } from '../config/env.js';

let _client: NeonQueryFunction<false, false> | null = null;

/**
 * Creates (or returns cached) a Neon serverless query client.
 * Reads DATABASE_URL from the validated env object.
 */
export function createDbClient(): NeonQueryFunction<false, false> {
  if (_client) return _client;
  _client = neon(env.DATABASE_URL);
  return _client;
}
