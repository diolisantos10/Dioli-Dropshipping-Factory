import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { runMigrations } from './migrations';

const globalForDb = globalThis as unknown as { ddfPool?: Pool; ddfReady?: Promise<void> };
const pool = globalForDb.ddfPool ?? new Pool({ connectionString: process.env.DATABASE_URL, max: 5, ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined });
if (process.env.NODE_ENV !== 'production') globalForDb.ddfPool = pool;

export const stateNamespaces = ['intake', 'products', 'media', 'pricing', 'connectors', 'orders'] as const;
export type StateNamespace = typeof stateNamespaces[number];
export function isStateNamespace(value: string): value is StateNamespace { return stateNamespaces.includes(value as StateNamespace); }

async function ready() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL não configurada.');
  globalForDb.ddfReady ??= (async () => {
    const client = await pool.connect();
    try {
      await runMigrations(client);
      await client.query(`CREATE TABLE IF NOT EXISTS ddf_state (
        namespace text PRIMARY KEY,
        payload jsonb NOT NULL,
        revision bigint NOT NULL DEFAULT 1,
        updated_at timestamptz NOT NULL DEFAULT now()
      )`);
    } finally { client.release(); }
  })();
  return globalForDb.ddfReady;
}
export async function readState(namespace: StateNamespace) {
  await ready(); const result = await pool.query('SELECT payload, revision, updated_at FROM ddf_state WHERE namespace = $1', [namespace]);
  return result.rows[0] ?? null;
}
export async function writeState(namespace: StateNamespace, payload: unknown, expectedRevision: number | null, actor: string, correlationId: string) {
  await ready();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const before = await client.query('SELECT payload, revision FROM ddf_state WHERE namespace=$1 FOR UPDATE', [namespace]);
    const result = expectedRevision === null
      ? await client.query(`INSERT INTO ddf_state(namespace,payload) VALUES($1,$2)
          ON CONFLICT(namespace) DO NOTHING RETURNING payload, revision, updated_at`, [namespace, JSON.stringify(payload)])
      : await client.query(`UPDATE ddf_state SET payload=$2, revision=revision+1, updated_at=now()
          WHERE namespace=$1 AND revision=$3 RETURNING payload, revision, updated_at`, [namespace, JSON.stringify(payload), expectedRevision]);
    if (!result.rows[0]) { await client.query('ROLLBACK'); return null; }
    await client.query(`INSERT INTO audit_events(id,actor,action,entity_type,entity_id,correlation_id,before_state,after_state,metadata)
      VALUES($1,$2,'STATE_UPDATED','STATE_NAMESPACE',$3,$4,$5,$6,$7)`, [
      randomUUID(), actor, namespace, correlationId, before.rows[0]?.payload ?? null, payload,
      JSON.stringify({ previousRevision: before.rows[0] ? Number(before.rows[0].revision) : null, revision: Number(result.rows[0].revision) }),
    ]);
    await client.query(`INSERT INTO outbox_events(id,topic,aggregate_type,aggregate_id,payload,idempotency_key)
      VALUES($1,'ddf.state.updated','STATE_NAMESPACE',$2,$3,$4)`, [
      randomUUID(), namespace, JSON.stringify({ namespace, revision: Number(result.rows[0].revision), correlationId }), `${namespace}:${result.rows[0].revision}`,
    ]);
    await client.query('COMMIT');
    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

export async function databaseHealth() {
  const started = Date.now();
  await ready();
  await pool.query('SELECT 1');
  return { status: 'up' as const, latencyMs: Date.now() - started };
}

export async function listAuditEvents(limit = 100) {
  await ready();
  const result = await pool.query(`SELECT id, occurred_at AS "occurredAt", actor, action, entity_type AS "entityType",
    entity_id AS "entityId", correlation_id AS "correlationId", reason, before_state AS "beforeState",
    after_state AS "afterState", metadata FROM audit_events ORDER BY occurred_at DESC LIMIT $1`, [Math.min(Math.max(limit, 1), 500)]);
  return result.rows;
}
