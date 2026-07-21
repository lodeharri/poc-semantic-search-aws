import * as cdk from 'aws-cdk-lib';
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

    // Get values from process.env (cargado por bin/poc-semantic-search.ts)
    const databaseUrl = process.env.DATABASE_URL;
    const geminiApiKey = process.env.GEMINI_API_KEY;

    if (!databaseUrl || !geminiApiKey) {
      // bin/poc-semantic-search.ts ya valida esto, pero es defensa en profundidad
      throw new Error(
        'DATABASE_URL and GEMINI_API_KEY must be set. Did you run `pnpm cdk:deploy` (which loads .env)?',
      );
    }

    // ===== Secrets =====
    // Las secrets se crean con los valores iniciales desde .env.
    // En deploys subsiguientes, CloudFormation detecta que la secret ya existe
    // con un valor diferente y requiere `--no-rollback` o `cdk import` si querés cambiar.
    const databaseSecret = new secretsmanager.Secret(this, 'DatabaseUrl', {
      secretName: 'poc-semantic-search/database-url',
      description: 'Neon Postgres connection string',
      secretStringValue: cdk.SecretValue.unsafePlainText(databaseUrl),
    });

    const geminiSecret = new secretsmanager.Secret(this, 'GeminiApiKey', {
      secretName: 'poc-semantic-search/gemini-api-key',
      description: 'Google Gemini API key for embeddings',
      secretStringValue: cdk.SecretValue.unsafePlainText(geminiApiKey),
    });

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

    // Function URL for easy testing without API Gateway
    // NOTE: Lambda Function URL handles OPTIONS preflight automatically when CORS is configured.
    // The manual OPTIONS handler in serving.ts will NOT be invoked for CORS preflight.
    const servingUrl = servingFn.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
      cors: {
        allowedOrigins: ['*'],
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
