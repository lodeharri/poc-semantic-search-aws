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
// STEP 2: Validate required env vars BEFORE any CDK synthesis
// ============================================================
const requiredVars = ['DATABASE_URL', 'GEMINI_API_KEY'] as const;
type RequiredVar = (typeof requiredVars)[number];

const missingVars: RequiredVar[] = [];
for (const varName of requiredVars) {
  if (!process.env[varName] || process.env[varName]!.trim().length === 0) {
    missingVars.push(varName);
  }
}

if (missingVars.length > 0) {
  console.error('\n❌ Missing required environment variables:');
  for (const v of missingVars) {
    console.error(`   - ${v}`);
  }
  console.error('\n📝 Populate them in your .env file (use .env.example as reference)');
  console.error('   .env is gitignored and never committed.\n');
  process.exit(1);
}

// ============================================================
// STEP 3: Construct CDK app + stack
// ============================================================
const app = new cdk.App();

// Allow stack name override via context (useful when the original stack is stuck in DELETE_IN_PROGRESS)
const stackName =
  (app.node.tryGetContext('stackName') as string | undefined) ?? 'PocSemanticSearchStack';

new PocSemanticSearchStack(app, stackName, {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT ?? '216890067629',
    region: process.env.CDK_DEFAULT_REGION ?? 'us-east-1',
  },
});
