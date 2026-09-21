import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import type { PoolClient } from 'pg';

export async function runMigrations(client: PoolClient) {
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);
  const directory = path.join(process.cwd(), 'migrations');
  const files = (await readdir(directory)).filter((name) => /^\d+.*\.sql$/.test(name)).sort();
  for (const file of files) {
    const existing = await client.query('SELECT 1 FROM schema_migrations WHERE version = $1', [file]);
    if (existing.rowCount) continue;
    const sql = await readFile(path.join(directory, file), 'utf8');
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations(version) VALUES($1)', [file]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }
}
