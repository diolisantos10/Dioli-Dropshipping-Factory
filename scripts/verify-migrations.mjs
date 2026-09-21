import { readFile, readdir } from 'node:fs/promises';

const requiredTables = [
  'audit_events', 'outbox_events', 'raw_candidates', 'triage_decisions', 'categories',
  'master_products', 'product_versions', 'product_variants', 'media_assets', 'suppliers',
  'supplier_connections', 'supplier_offers', 'inventory_snapshots', 'brands', 'stores',
  'channels', 'channel_connections', 'listings', 'pricing_rules', 'price_calculations',
  'orders', 'order_items', 'supplier_orders', 'fulfillments', 'shipments', 'tracking_events',
  'sync_jobs', 'intelligence_metrics',
];

const files = (await readdir('migrations')).filter((name) => name.endsWith('.sql')).sort();
if (!files.length) throw new Error('Nenhuma migration encontrada.');
const sql = (await Promise.all(files.map((name) => readFile(`migrations/${name}`, 'utf8')))).join('\n');
for (const table of requiredTables) {
  if (!new RegExp(`CREATE TABLE IF NOT EXISTS\\s+${table}\\b`, 'i').test(sql)) throw new Error(`Tabela obrigatória ausente: ${table}`);
}
console.log(`${files.length} migration(s) válida(s); ${requiredTables.length} tabelas essenciais declaradas.`);
