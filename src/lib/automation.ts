import { randomUUID } from 'node:crypto';
import { runServerCommand } from './command-runner';
import { getChannelAdapterForIntegration, getSupplierAdapterForIntegration, refreshExpiringCredentials } from './integrations';
import { drainOutbox, getDatabasePool, readState } from './server-state';
import { emptyCatalog, type CatalogState } from './catalog';
import { emptyOrders, purgeExpiredOrderData, type OrderState } from './orders';
import { emptyPricing, type PricingState } from './pricing';

export type AutomationTask = 'outbox' | 'credentials' | 'supplierOffers' | 'channelOrders' | 'retention';
export const automationTasks: AutomationTask[] = ['credentials', 'outbox', 'supplierOffers', 'channelOrders', 'retention'];
type TaskResult = { task: AutomationTask; status: 'SUCCEEDED' | 'FAILED'; durationMs: number; detail: Record<string, unknown>; error?: string };
const SYSTEM = { role: 'SYSTEM' as const };
const MAX_OFFERS_PER_RUN = 25;
const ORDER_LOOKBACK_DAYS = 3;

// AliExpress offers are identified by a numeric item ID and a supplier name matching a connected
// AliExpress integration (or containing "aliexpress"). Cost/stock snapshots are refreshed only;
// prices are never re-propagated automatically — Margin Guard approval stays manual.
async function syncSupplierOffers(actor: string, correlationId: string) {
  const db = await getDatabasePool();
  const suppliers = (await db.query(`SELECT id,name FROM integration_configs WHERE kind='SUPPLIER' AND provider_key='aliexpress' AND status IN ('TESTED','ACTIVE') ORDER BY status='ACTIVE' DESC, updated_at DESC`)).rows as { id: string; name: string }[];
  if (!suppliers.length) return { skipped: 'Nenhuma integração AliExpress testada.' };
  const catalog = ((await readState('catalog'))?.payload ?? emptyCatalog) as CatalogState;
  const names = new Set(suppliers.map((item) => item.name.toLocaleLowerCase()));
  const offers = catalog.offers.filter((offer) => /^\d{5,30}$/.test(offer.supplierRef) && (names.has(offer.supplierName.toLocaleLowerCase()) || /aliexpress/i.test(offer.supplierName)))
    .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt)).slice(0, MAX_OFFERS_PER_RUN);
  if (!offers.length) return { checked: 0, updated: 0 };
  const connection = await getSupplierAdapterForIntegration(suppliers[0].id);
  if (!connection) return { skipped: 'Fornecedor indisponível.' };
  let updated = 0; const failures: string[] = [];
  for (const offer of offers) {
    try {
      const product = await connection.adapter.getProduct(offer.supplierRef);
      const leadTime = product.shippingTime ? Number.parseInt(product.shippingTime, 10) : null;
      const next = { cost: product.price, currency: product.currency, stock: product.stock ?? null, leadTimeDays: Number.isInteger(leadTime) ? leadTime : null };
      if (next.cost <= 0) throw new Error('custo não retornado');
      if (next.cost === offer.cost && next.currency === offer.currency && next.stock === offer.stock && next.leadTimeDays === offer.leadTimeDays) continue;
      await runServerCommand('catalog.refreshOffer', { offerId: offer.id, ...next }, { ...SYSTEM, actor, correlationId });
      updated += 1;
    } catch (error) { failures.push(`${offer.supplierRef}: ${error instanceof Error ? error.message : 'falha'}`); }
  }
  if (failures.length === offers.length) throw new Error(`Nenhuma oferta sincronizada. ${failures.slice(0, 3).join('; ')}`);
  return { checked: offers.length, updated, failures };
}

// Imports paid orders for products published through DDF. Idempotent: the external ID is
// "provider:order:line", and receiveOrder rejects already processed IDs.
async function importChannelOrders(actor: string, correlationId: string) {
  const db = await getDatabasePool();
  const channels = (await db.query(`SELECT id,name FROM integration_configs WHERE kind='CHANNEL' AND provider_key='shopify' AND status='ACTIVE'`)).rows as { id: string; name: string }[];
  if (!channels.length) return { skipped: 'Nenhum canal Shopify ativo.' };
  const pricing = ((await readState('pricing'))?.payload ?? emptyPricing) as PricingState;
  let imported = 0; let ignored = 0; const failures: string[] = [];
  for (const channel of channels) {
    try {
      const connection = await getChannelAdapterForIntegration(channel.id, 'read');
      if (!connection) continue;
      const listings = (await db.query(`SELECT product_id,external_id,price_calculation_id FROM channel_listings WHERE integration_id=$1`, [channel.id])).rows as { product_id: string; external_id: string; price_calculation_id: string }[];
      if (!listings.length) continue;
      const byExternal = new Map(listings.map((item) => [item.external_id, item]));
      const since = new Date(Date.now() - ORDER_LOOKBACK_DAYS * 86_400_000).toISOString();
      const orders = await connection.adapter.listRecentOrders({ since, limit: 100 });
      const processed = new Set((((await readState('orders'))?.payload ?? emptyOrders) as OrderState).processedExternalIds);
      for (const order of orders) {
        if (order.cancelled || !['PAID', 'PARTIALLY_REFUNDED'].includes(order.financialStatus)) { ignored += 1; continue; }
        const orderNumber = order.externalOrderId.split('/').pop();
        for (const [index, line] of order.lines.entries()) {
          const listing = line.externalProductId ? byExternal.get(line.externalProductId) : undefined;
          if (!listing || line.quantity <= 0) continue;
          const externalOrderId = `shopify:${orderNumber}:${index + 1}`;
          if (processed.has(externalOrderId)) continue;
          const calculation = pricing.calculations.find((item) => item.id === listing.price_calculation_id);
          await runServerCommand('orders.receive', {
            externalOrderId, productId: listing.product_id, salePrice: Math.round(line.unitPrice * line.quantity * 100) / 100,
            costSnapshot: Math.round((calculation?.totalFixedCost ?? 0) * line.quantity * 100) / 100, currency: order.currency || calculation?.currency || 'BRL',
          }, { ...SYSTEM, actor, correlationId });
          processed.add(externalOrderId); imported += 1;
        }
      }
    } catch (error) { failures.push(`${channel.name}: ${error instanceof Error ? error.message : 'falha'}`); }
  }
  if (failures.length && failures.length === channels.length) throw new Error(failures.join('; '));
  return { channels: channels.length, imported, ignored, failures };
}

async function applyRetention(actor: string, correlationId: string) {
  const orders = ((await readState('orders'))?.payload ?? emptyOrders) as OrderState;
  const next = purgeExpiredOrderData(orders, new Date().toISOString());
  if (JSON.stringify(next) === JSON.stringify(orders)) return { changed: false };
  await runServerCommand('orders.purgeExpired', {}, { ...SYSTEM, actor, correlationId });
  return { changed: true };
}

const handlers: Record<AutomationTask, (actor: string, correlationId: string) => Promise<Record<string, unknown>>> = {
  credentials: (actor) => refreshExpiringCredentials(actor),
  outbox: async () => drainOutbox(100),
  supplierOffers: syncSupplierOffers,
  channelOrders: importChannelOrders,
  retention: applyRetention,
};

// Each task runs isolated: one failing integration never blocks the others. A run is refused while
// another run started less than 10 minutes ago is still RUNNING (overlapping cron invocations).
export async function runAutomation(trigger: string, actor: string, tasks: AutomationTask[] = automationTasks) {
  const db = await getDatabasePool();
  const correlationId = randomUUID(); const id = randomUUID();
  const inserted = await db.query(`INSERT INTO automation_runs(id,trigger,actor,correlation_id,status)
    SELECT $1,$2,$3,$4,'RUNNING' WHERE NOT EXISTS (SELECT 1 FROM automation_runs WHERE status='RUNNING' AND started_at > now() - interval '10 minutes') RETURNING id`, [id, trigger.slice(0, 60), actor, correlationId]);
  if (!inserted.rowCount) return { id: null, status: 'SKIPPED' as const, reason: 'Outra execução ainda está em andamento.', results: [] as TaskResult[] };
  const results: TaskResult[] = [];
  for (const task of tasks) {
    const started = Date.now();
    try { results.push({ task, status: 'SUCCEEDED', durationMs: Date.now() - started, detail: await handlers[task](actor, correlationId) }); }
    catch (error) { results.push({ task, status: 'FAILED', durationMs: Date.now() - started, detail: {}, error: error instanceof Error ? error.message.slice(0, 500) : 'falha desconhecida' }); }
  }
  const failed = results.filter((item) => item.status === 'FAILED').length;
  const status = failed === 0 ? 'SUCCEEDED' : failed === results.length ? 'FAILED' : 'PARTIAL';
  await db.query(`UPDATE automation_runs SET status=$2,finished_at=now(),results=$3 WHERE id=$1`, [id, status, JSON.stringify(results)]);
  await db.query(`INSERT INTO audit_events(id,actor,action,entity_type,entity_id,correlation_id,metadata) VALUES($1,$2,'AUTOMATION_RUN','AUTOMATION_RUN',$3,$4,$5)`, [randomUUID(), actor, id, correlationId, JSON.stringify({ trigger, status, results })]);
  return { id, status, correlationId, results };
}

export async function recentAutomationRuns(limit = 20) {
  const db = await getDatabasePool();
  return (await db.query(`SELECT id,trigger,actor,status,started_at AS "startedAt",finished_at AS "finishedAt",results FROM automation_runs ORDER BY started_at DESC LIMIT $1`, [Math.min(Math.max(limit, 1), 100)])).rows;
}
