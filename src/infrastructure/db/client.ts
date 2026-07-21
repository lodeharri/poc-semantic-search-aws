import { neon } from '@neondatabase/serverless';
import type { NeonQueryFunction } from '@neondatabase/serverless';
import { env } from '../config/env.js';

let _client: NeonQueryFunction<false, false> | null = null;

/**
 * Singleton factory for the Neon serverless HTTP client.
 * Reusable across multiple adapters (NeonDocumentRepository, NeonDocumentSearcher).
 */
export function getNeonClient(): NeonQueryFunction<false, false> {
  if (!_client) {
    _client = neon(env.DATABASE_URL);
  }
  return _client;
}
