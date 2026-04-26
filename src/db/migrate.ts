import { readdir, readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { pool, closePool } from './pool.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA_DIR = join(__dirname, '../../schema');

async function ensureMigrationsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      filename VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function getAppliedMigrations(): Promise<Set<string>> {
  const result = await pool.query('SELECT filename FROM schema_migrations ORDER BY id');
  return new Set(result.rows.map((row: { filename: string }) => row.filename));
}

async function applyMigration(filename: string, sql: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query(
      'INSERT INTO schema_migrations (filename) VALUES ($1)',
      [filename]
    );
    await client.query('COMMIT');
    console.log(`  Applied: ${filename}`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function migrate(): Promise<void> {
  console.log('Running database migrations...\n');

  try {
    await ensureMigrationsTable();
    const applied = await getAppliedMigrations();

    const files = await readdir(SCHEMA_DIR);
    const sqlFiles = files
      .filter((f) => f.endsWith('.sql'))
      .sort();

    let appliedCount = 0;

    for (const file of sqlFiles) {
      if (applied.has(file)) {
        console.log(`  Skipped: ${file} (already applied)`);
        continue;
      }

      const sql = await readFile(join(SCHEMA_DIR, file), 'utf-8');
      await applyMigration(file, sql);
      appliedCount++;
    }

    if (appliedCount === 0) {
      console.log('\nNo new migrations to apply.');
    } else {
      console.log(`\nApplied ${appliedCount} migration(s).`);
    }
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await closePool();
  }
}

migrate();
