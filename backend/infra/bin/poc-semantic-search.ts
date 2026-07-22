#!/usr/bin/env node
/**
 * CDK app entry point for Poc_semantic_search.
 * Loads .env BEFORE any CDK code runs, validates required vars, then deploys.
 *
 * Usage:
 *   pnpm cdk:synth     # valida .env + genera template
 *   pnpm cdk:deploy    # valida .env + deploy
 */
import 'source-map-support/register';
import { config } from 'dotenv';
import * as cdk from 'aws-cdk-lib';
import { PocSemanticSearchStack } from '../lib/poc-semantic-search-stack.js';

// ============================================================
// STEP 1: Load .env (silencioso si ya está en process.env)
// ============================================================
const envResult = config({ path: '.env' });
if (envResult.error) {
  console.warn(`⚠ Could not load .env: ${envResult.error.message}`);
  console.warn('  Continuing — vars may already be in process.env');
}

// ============================================================
// STEP 2: Construct CDK app + stack
// ============================================================
// Secrets are NOT loaded here — the stack reads ARNs from CDK context.
// Local devs can either pass `--context databaseSecretArn=...` on the CLI,
// or set DATABASE_SECRET_ARN / GEMINI_SECRET_ARN in their .env (see README).
// ============================================================
const app = new cdk.App();

// Allow stack name override via context (useful when the original stack is stuck in DELETE_IN_PROGRESS)
const stackName =
  (app.node.tryGetContext('stackName') as string | undefined) ?? 'PocSemanticSearchStack';

// Surface ARN context from env vars if set, so local devs can put them in .env
// without having to type them on every command. CLI --context takes precedence.
if (process.env.DATABASE_SECRET_ARN && !app.node.tryGetContext('databaseSecretArn')) {
  app.node.setContext('databaseSecretArn', process.env.DATABASE_SECRET_ARN);
}
if (process.env.GEMINI_SECRET_ARN && !app.node.tryGetContext('geminiSecretArn')) {
  app.node.setContext('geminiSecretArn', process.env.GEMINI_SECRET_ARN);
}

new PocSemanticSearchStack(app, stackName, {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT ?? '216890067629',
    region: process.env.CDK_DEFAULT_REGION ?? 'us-east-1',
  },
});
