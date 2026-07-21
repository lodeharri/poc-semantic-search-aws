/**
 * Lambda Migrator for CloudFormation CustomResource.
 * Runs Drizzle migrations against Neon Postgres on stack CREATE/UPDATE.
 * Sends cfn-response to CloudFormation to signal success/failure.
 *
 * IMPORTANT: This is a CustomResource handler. It MUST call sendResponse()
 * to CloudFormation via event.ResponseURL. Without it, the stack hangs ~1h.
 */
import type { Context } from 'aws-lambda';

interface CfnResponse {
  Status: 'SUCCESS' | 'FAILED';
  PhysicalResourceId: string;
  StackId: string;
  RequestId: string;
  LogicalResourceId: string;
  Reason?: string;
  Data?: Record<string, unknown>;
  NoEcho?: boolean;
}

interface CfnEvent {
  RequestType: 'Create' | 'Update' | 'Delete';
  ResponseURL: string;
  StackId: string;
  RequestId: string;
  LogicalResourceId: string;
  PhysicalResourceId?: string;
  ResourceProperties: Record<string, unknown>;
}

export const handler = async (event: CfnEvent, _context: Context): Promise<void> => {
  console.log(`CustomResource ${event.RequestType} for ${event.LogicalResourceId}`);
  console.log('Event:', JSON.stringify(event, null, 2));

  const physicalResourceId = event.PhysicalResourceId ?? `migration-${event.RequestId}`;

  const response: CfnResponse = {
    Status: 'FAILED',
    PhysicalResourceId: physicalResourceId,
    StackId: event.StackId,
    RequestId: event.RequestId,
    LogicalResourceId: event.LogicalResourceId,
    Reason: 'Unknown error',
  };

  try {
    // On DELETE, don't run migrations — just signal success
    if (event.RequestType === 'Delete') {
      console.log('Delete request — skipping migration');
      response.Status = 'SUCCESS';
      response.Reason = 'Migration skipped on stack delete';
      await sendCfnResponse(event.ResponseURL, response);
      return;
    }

    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('DATABASE_URL env var is not set on the Lambda');
    }

    // Lazy import to keep cold start fast
    const { neon } = await import('@neondatabase/serverless');
    const { drizzle } = await import('drizzle-orm/neon-http');
    const { migrate } = await import('drizzle-orm/neon-http/migrator');
    const path = await import('node:path');

    const sql = neon(databaseUrl);
    const db = drizzle(sql);

    // Migrations folder is bundled by CDK into the Lambda zip at /var/task/drizzle
    const migrationsFolder = path.join(process.cwd(), 'drizzle');
    console.log(`Applying migrations from: ${migrationsFolder}`);

    await migrate(db, { migrationsFolder });

    console.log('✅ Migrations applied successfully');

    response.Status = 'SUCCESS';
    response.Reason = `Migration completed at ${new Date().toISOString()}`;
    response.Data = {
      Status: 'SUCCESS',
      Timestamp: new Date().toISOString(),
    };

    await sendCfnResponse(event.ResponseURL, response);
  } catch (err) {
    console.error('❌ Migration failed:', err);
    response.Status = 'FAILED';
    response.Reason = err instanceof Error ? `${err.message}\n${err.stack}` : String(err);
    await sendCfnResponse(event.ResponseURL, response);

    // Don't throw — we already sent FAILED to CF. Throwing would cause a Lambda error too.
  }
};

/**
 * Sends a response to CloudFormation via the pre-signed S3 URL.
 * CF waits for this PUT request before considering the CustomResource complete.
 */
async function sendCfnResponse(responseUrl: string, response: CfnResponse): Promise<void> {
  const https = await import('node:https');
  const { URL } = await import('node:url');

  const body = JSON.stringify(response);
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(responseUrl);
  } catch {
    throw new Error(`Invalid ResponseURL: ${responseUrl}`);
  }

  const options = {
    hostname: parsedUrl.hostname,
    port: 443,
    path: `${parsedUrl.pathname}${parsedUrl.search}`,
    method: 'PUT' as const,
    headers: {
      'Content-Type': '',
      'Content-Length': Buffer.byteLength(body).toString(),
    },
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      console.log(`cfn-response sent, status: ${res.statusCode}`);
      // Drain the response so the socket can be reused
      res.on('data', () => {});
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`cfn-response returned HTTP ${res.statusCode}`));
        } else {
          resolve();
        }
      });
    });

    req.on('error', (err) => {
      console.error('cfn-response error:', err);
      reject(err);
    });

    req.setTimeout(30000, () => {
      req.destroy(new Error('cfn-response timeout after 30s'));
    });

    req.write(body);
    req.end();
  });
}
