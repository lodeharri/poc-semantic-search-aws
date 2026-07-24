import * as cdk from 'aws-cdk-lib';
import { Stack } from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { CustomResource } from 'aws-cdk-lib/core';
import { Construct } from 'constructs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// ESM-compatible __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class PocSemanticSearchStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ===== Secrets =====
    // Secrets are created OUTSIDE the CDK lifecycle (one-time bootstrap via
    // `aws secretsmanager create-secret`). CDK only references them by ARN,
    // so secret VALUES never enter the repo, the CI runner, or the CDK context.
    const databaseSecretArn = Stack.of(this).node.tryGetContext('databaseSecretArn') as
      | string
      | undefined;
    const geminiSecretArn = Stack.of(this).node.tryGetContext('geminiSecretArn') as
      | string
      | undefined;

    if (!databaseSecretArn || !geminiSecretArn) {
      throw new Error(
        'Missing required context: databaseSecretArn and geminiSecretArn. ' +
          'Pass via --context databaseSecretArn=... --context geminiSecretArn=...',
      );
    }

    const databaseSecret = secretsmanager.Secret.fromSecretCompleteArn(
      this,
      'DatabaseUrl',
      databaseSecretArn,
    );

    const geminiSecret = secretsmanager.Secret.fromSecretCompleteArn(
      this,
      'GeminiApiKey',
      geminiSecretArn,
    );

    // ===== Lambda Migrator =====
    const migratorFn = new NodejsFunction(this, 'Migrator', {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, '../../lambda/migrator.ts'),
      handler: 'handler',
      timeout: cdk.Duration.minutes(2),
      memorySize: 256,
      environment: {
        DATABASE_URL: databaseSecret.secretValue.unsafeUnwrap(),
      },
      bundling: {
        commandHooks: {
          beforeInstall: () => [],
          beforeBundling: () => [],
          afterBundling: (inputDir: string, outputDir: string) => [
            `cp -r ${inputDir}/drizzle ${outputDir}/`,
          ],
        },
        nodeModules: ['drizzle-orm', '@neondatabase/serverless'],
      },
    });

    // CustomResource triggers migration on each CDK deploy
    const migrationResource = new CustomResource(this, 'Migration', {
      serviceToken: migratorFn.functionArn,
      properties: {
        // Force re-execution on each deploy
        Timestamp: new Date().toISOString(),
      },
    });

    // ===== Lambda Serving =====
    const servingFn = new NodejsFunction(this, 'Serving', {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, '../../lambda/serving.ts'),
      handler: 'handler',
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      environment: {
        DATABASE_URL: databaseSecret.secretValue.unsafeUnwrap(),
        GEMINI_API_KEY: geminiSecret.secretValue.unsafeUnwrap(),
      },
      bundling: {
        nodeModules: ['@neondatabase/serverless'],
      },
    });

    // Grant read access to secrets
    databaseSecret.grantRead(servingFn);
    geminiSecret.grantRead(servingFn);
    databaseSecret.grantRead(migratorFn);

    // Function URL for easy testing without API Gateway.
    //
    // CORS: Lambda Function URL intercepts OPTIONS preflight and adds the
    // appropriate headers to every response. We configure the allowed
    // origins here as the SINGLE source of truth for CORS — the handler
    // in serving.ts does NOT add CORS headers (mixing them with the
    // Function URL's would produce invalid duplicate headers like
    // `*, http://localhost:5173`).
    //
    // Origins are read from CDK context `corsOrigins` (comma-separated)
    // so production deploys can override the default.
    const corsOrigins = (this.node.tryGetContext('corsOrigins') as string | undefined)
      ?.split(',')
      .map((o) => o.trim())
      .filter(Boolean) ?? ['http://localhost:5173'];

    const servingUrl = servingFn.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
      cors: {
        allowedOrigins: corsOrigins,
        allowedMethods: [lambda.HttpMethod.GET, lambda.HttpMethod.POST],
        allowedHeaders: [
          'Content-Type',
          'Authorization',
          'X-Amz-Date',
          'X-Amz-Security-Token',
          'X-Amz-User-Agent',
        ],
        maxAge: cdk.Duration.seconds(86400), // cache preflight 24h
      },
    });

    // Dependency: serving deploys only after migrations succeed
    servingFn.node.addDependency(migrationResource);

    // ===== Outputs =====
    new cdk.CfnOutput(this, 'ServingFunctionUrl', {
      value: servingUrl.url,
      description: 'URL to invoke the Lambda serving function',
    });

    new cdk.CfnOutput(this, 'DatabaseSecretArn', {
      value: databaseSecret.secretArn,
      description: 'ARN of the database URL secret',
    });

    new cdk.CfnOutput(this, 'GeminiSecretArn', {
      value: geminiSecret.secretArn,
      description: 'ARN of the Gemini API key secret',
    });

    new cdk.CfnOutput(this, 'MigrationStatus', {
      value: migrationResource.getAttString('Status'),
      description: 'Status of the migration custom resource',
    });
  }
}
