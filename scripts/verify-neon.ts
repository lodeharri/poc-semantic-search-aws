import { neon } from '@neondatabase/serverless';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL not set');
  process.exit(1);
}

const sql = neon(DATABASE_URL);

async function main() {
  console.log('=== Neon + pgvector Verification ===\n');

  const tables = await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'documents'
  `;
  console.log(`✅ documents table exists: ${tables.length > 0}`);

  const cols = await sql`
    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_name = 'documents' ORDER BY ordinal_position
  `;
  console.log('\nColumns:');
  for (const c of cols) console.log(`  - ${c.column_name}: ${c.data_type}`);

  const mig = await sql`
    SELECT id, hash, created_at FROM __drizzle_migrations ORDER BY id
  `;
  console.log(`\n✅ __drizzle_migrations: ${mig.length} entries`);
  for (const m of mig) {
    console.log(`  - id=${m.id} hash=${m.hash.substring(0, 12)}... at ${m.created_at}`);
  }

  const count = await sql`SELECT COUNT(*)::int AS n FROM documents`;
  console.log(`\n✅ documents count: ${count[0].n}`);
}

main().catch((e) => {
  console.error('❌ Error:', e);
  process.exit(1);
});
