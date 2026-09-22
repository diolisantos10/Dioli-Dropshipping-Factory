import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { runMigrations } from './migrations';
import { projectState } from './state-projector';

const globalForDb = globalThis as unknown as { ddfPool?: Pool; ddfReady?: Promise<void> };
const pool = globalForDb.ddfPool ?? new Pool({ connectionString: process.env.DATABASE_URL, max: 5, ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined });
if (process.env.NODE_ENV !== 'production') globalForDb.ddfPool = pool;

export const stateNamespaces = ['intake', 'products', 'media', 'pricing', 'connectors', 'orders', 'catalog'] as const;
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
      const existing = await client.query('SELECT namespace, payload FROM ddf_state');
      for (const namespace of ['intake','products','media','pricing','orders'] as StateNamespace[]) {
        const row = existing.rows.find((item) => item.namespace === namespace);
        if (row) await projectState(client, namespace, row.payload, 'system:migration');
      }
    } finally { client.release(); }
  })();
  return globalForDb.ddfReady;
}
export async function getDatabasePool() { await ready(); return pool; }
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
    await projectState(client, namespace, payload, actor);
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
    await drainOutbox(20).catch(() => undefined);
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

export async function reprocessOutboxEvent(id:string, actor:string, correlationId:string) {
  await ready();
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    const result=await client.query(`UPDATE outbox_events SET status='PENDING',attempts=0,available_at=now(),last_error=NULL,published_at=NULL
      WHERE id=$1 AND status IN ('FAILED','DEAD') RETURNING id,topic,aggregate_type,aggregate_id`,[id]);
    if(!result.rows[0]) { await client.query('ROLLBACK'); return null; }
    const event=result.rows[0];
    await client.query(`INSERT INTO audit_events(id,actor,action,entity_type,entity_id,correlation_id,metadata)
      VALUES($1,$2,'OUTBOX_REPROCESS_REQUESTED','OUTBOX_EVENT',$3,$4,$5)`,[
      randomUUID(),actor,id,correlationId,JSON.stringify({topic:event.topic,aggregateType:event.aggregate_type,aggregateId:event.aggregate_id}),
    ]);
    await client.query('COMMIT');
    return {id:event.id,status:'PENDING' as const};
  } catch(error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

export async function drainOutbox(limit = 20) {
  await ready();
  const client = await pool.connect();
  let published = 0; let failed = 0;
  try {
    await client.query('BEGIN');
    const result = await client.query(`SELECT * FROM outbox_events
      WHERE status IN ('PENDING','FAILED') AND available_at <= now()
      ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT $1`, [Math.min(Math.max(limit,1),100)]);
    for (const event of result.rows) {
      try {
        if (event.topic !== 'ddf.state.updated') throw new Error(`Tópico sem handler: ${event.topic}`);
        await client.query(`UPDATE outbox_events SET status='PUBLISHED',attempts=attempts+1,published_at=now(),last_error=NULL WHERE id=$1`,[event.id]);
        published += 1;
      } catch (error) {
        const attempts = Number(event.attempts) + 1;
        const status = attempts >= 5 ? 'DEAD' : 'FAILED';
        await client.query(`UPDATE outbox_events SET status=$2,attempts=$3,last_error=$4,
          available_at=now() + make_interval(secs => LEAST(300, power(2,$3)::int)) WHERE id=$1`,
          [event.id,status,attempts,error instanceof Error?error.message:'Falha desconhecida']);
        failed += 1;
      }
    }
    await client.query('COMMIT');
    return { processed: result.rowCount ?? 0, published, failed };
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

export async function operationalStatus() {
  await ready();
  const started=Date.now();
  const [outbox, queue, audit, state] = await Promise.all([
    pool.query(`SELECT status,count(*)::int AS count FROM outbox_events GROUP BY status`),
    pool.query(`SELECT id,topic,aggregate_type AS "aggregateType",aggregate_id AS "aggregateId",status,attempts,
      available_at AS "availableAt",created_at AS "createdAt",published_at AS "publishedAt",last_error AS "lastError",
      payload->>'correlationId' AS "correlationId" FROM outbox_events ORDER BY created_at DESC LIMIT 100`),
    pool.query(`SELECT count(*)::int AS count,max(occurred_at) AS latest FROM audit_events`),
    pool.query(`SELECT namespace,revision,updated_at AS "updatedAt",updated_at < now() - interval '24 hours' AS stale FROM ddf_state ORDER BY namespace`),
  ]);
  return {generatedAt:new Date().toISOString(),latencyMs:Date.now()-started,outbox:Object.fromEntries(outbox.rows.map(row=>[row.status,row.count])),queue:queue.rows,audit:audit.rows[0],state:state.rows.map(row=>({...row,revision:Number(row.revision)}))};
}
