/**
 * Neon + pgvector connection test script.
 * Reads DATABASE_URL from process.env (user sets it in shell or .env).
 * Does NOT use dotenv — let the user control env loading.
 */

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL is not set in the environment.');
  console.error('   Set it in your shell or .env file, then re-run.');
  process.exit(1);
}

console.log('🔌 Testing Neon connection...\n');

async function runTests() {
  const { Pool } = await import('@neondatabase/serverless');
  const pool = new Pool({ connectionString: DATABASE_URL });

  try {
    // Test 1: basic connection
    console.log('1. Testing basic connection (SELECT version())...');
    const versionResult = await pool.query('SELECT version()');
    console.log(
      `   ✅ Connected! Postgres version: ${versionResult.rows[0].version.split(' ')[1]}\n`,
    );

    // Test 2: pgvector extension
    console.log('2. Checking pgvector extension...');
    const vectorResult = await pool.query(
      "SELECT extname FROM pg_extension WHERE extname = 'vector';",
    );
    if (vectorResult.rows.length === 0) {
      console.error('   ❌ pgvector extension not found. Enable it in your Neon dashboard.');
      process.exit(1);
    }
    console.log('   ✅ pgvector extension is available.\n');

    // Test 3: create temp table
    console.log('3. Creating temporary test table with vector(3)...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS _connection_test (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        embedding vector(3)
      );
    `);
    console.log('   ✅ Table created.\n');

    // Test 4: insert dummy embedding
    console.log("4. Inserting dummy embedding '[0.1, 0.2, 0.3]'...");
    await pool.query(
      "INSERT INTO _connection_test (name, embedding) VALUES ('test', '[0.1, 0.2, 0.3]'::vector);",
    );
    console.log('   ✅ Insert succeeded.\n');

    // Test 5: read back
    console.log('5. Reading back inserted row...');
    const rows = await pool.query('SELECT * FROM _connection_test;');
    console.log(`   ✅ Row retrieved: ${JSON.stringify(rows.rows[0])}\n`);

    // Test 6: cleanup
    console.log('6. Cleaning up temporary table...');
    await pool.query('DROP TABLE _connection_test;');
    console.log('   ✅ Table dropped.\n');

    console.log('🎉 All tests passed! Neon + pgvector is ready.');
    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Connection test failed:');
    if (err instanceof Error) {
      console.error(`   ${err.message}`);
      if ('code' in err)
        console.error(`   PostgreSQL error code: ${(err as { code: string }).code}`);
    } else {
      console.error(err);
    }
    await pool.end().catch(() => {});
    process.exit(1);
  }
}

runTests();
