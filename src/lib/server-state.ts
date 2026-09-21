import { Pool } from 'pg';

const globalForDb = globalThis as unknown as { ddfPool?: Pool; ddfReady?: Promise<void> };
const pool = globalForDb.ddfPool ?? new Pool({ connectionString: process.env.DATABASE_URL, max: 5, ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined });
if (process.env.NODE_ENV !== 'production') globalForDb.ddfPool = pool;

export const stateNamespaces = ['intake', 'products', 'media', 'pricing', 'connectors', 'orders'] as const;
export type StateNamespace = typeof stateNamespaces[number];
export function isStateNamespace(value: string): value is StateNamespace { return stateNamespaces.includes(value as StateNamespace); }

async function ready() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL não configurada.');
  globalForDb.ddfReady ??= pool.query(`CREATE TABLE IF NOT EXISTS ddf_state (
    namespace text PRIMARY KEY,
    payload jsonb NOT NULL,
    revision bigint NOT NULL DEFAULT 1,
    updated_at timestamptz NOT NULL DEFAULT now()
  )`).then(() => undefined);
  return globalForDb.ddfReady;
}
export async function readState(namespace: StateNamespace) {
  await ready(); const result = await pool.query('SELECT payload, revision, updated_at FROM ddf_state WHERE namespace = $1', [namespace]);
  return result.rows[0] ?? null;
}
export async function writeState(namespace: StateNamespace, payload: unknown, expectedRevision: number | null) {
  await ready();
  if (expectedRevision === null) {
    const result = await pool.query(`INSERT INTO ddf_state(namespace,payload) VALUES($1,$2)
      ON CONFLICT(namespace) DO NOTHING RETURNING payload, revision, updated_at`, [namespace, JSON.stringify(payload)]);
    return result.rows[0] ?? null;
  }
  const result = await pool.query(`UPDATE ddf_state SET payload=$2, revision=revision+1, updated_at=now()
    WHERE namespace=$1 AND revision=$3 RETURNING payload, revision, updated_at`, [namespace, JSON.stringify(payload), expectedRevision]);
  return result.rows[0] ?? null;
}
