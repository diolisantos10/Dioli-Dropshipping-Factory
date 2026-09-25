import { randomUUID } from 'node:crypto';
import { CommandError } from './commands';
import { getChannelAdapterForIntegration } from './integrations';
import { plainTextToHtml } from './providers/shopify';
import type { ChannelListingInput } from './providers/types';
import { getDatabasePool, readState } from './server-state';
import { emptyMedia, type MediaState } from './media-factory';
import { emptyPricing, type PriceCalculation, type PricingState } from './pricing';
import { emptyProductFactory, type MasterProduct, type ProductFactoryState } from './product-factory';

export function latestApprovedPrice(pricing: PricingState, productId: string): PriceCalculation | null {
  return pricing.calculations.find((item) => item.productId === productId && item.status === 'CALCULADO' && item.approval === 'APROVADO' && item.suggestedPrice !== null) ?? null;
}

export function listingInputFor(product: MasterProduct, price: PriceCalculation, media: MediaState, externalId: string | null): ChannelListingInput {
  if (product.status !== 'PRONTO') throw new CommandError('Somente produtos PRONTOS podem ser publicados.');
  const bullets = product.bullets.filter(Boolean);
  const description = [plainTextToHtml(product.longDescription || product.shortDescription), bullets.length ? `<ul>${bullets.map((item) => `<li>${plainTextToHtml(item).replace(/^<p>|<\/p>$/g, '')}</li>`).join('')}</ul>` : ''].join('');
  const images = media.assets.filter((asset) => asset.productId === product.id && asset.status === 'APROVADA' && asset.url.startsWith('https://') && !(asset.mimeType ?? '').startsWith('video/')).map((asset) => asset.url);
  return {
    externalId, title: product.spec?.seo.title?.trim() || product.universalTitle, descriptionHtml: description,
    productType: product.category, tags: product.tags, vendor: 'DDF', sku: product.spec?.variants[0]?.sku || `DDF-${product.id.slice(0, 8).toUpperCase()}`,
    price: price.suggestedPrice ?? 0, currency: price.currency, imageUrls: images,
  };
}

// Publishing is an explicit approver action: ACTIVE channel, READY product, APPROVED price. The
// product is created as DRAFT in the channel; going live remains a human decision in the storefront.
export async function publishProductToChannel(integrationId: string, productId: string, actor: string, correlationId: string) {
  const connection = await getChannelAdapterForIntegration(integrationId, 'write');
  if (!connection) throw new CommandError('Canal não encontrado.', 404);
  const [productsRow, pricingRow, mediaRow] = await Promise.all([readState('products'), readState('pricing'), readState('media')]);
  const products = (productsRow?.payload ?? emptyProductFactory) as ProductFactoryState;
  const pricing = (pricingRow?.payload ?? emptyPricing) as PricingState;
  const media = (mediaRow?.payload ?? emptyMedia) as MediaState;
  const product = products.products.find((item) => item.id === productId);
  if (!product) throw new CommandError('Produto não encontrado.', 404);
  const price = latestApprovedPrice(pricing, productId);
  if (!price) throw new CommandError('Aprove um preço seguro (Margin Guard) antes de publicar.');
  const db = await getDatabasePool();
  const existing = (await db.query('SELECT * FROM channel_listings WHERE integration_id=$1 AND product_id=$2', [integrationId, productId])).rows[0];
  const result = await connection.adapter.upsertListing(listingInputFor(product, price, media, existing?.external_id ?? null));
  const listing = (await db.query(`INSERT INTO channel_listings(id,integration_id,product_id,price_calculation_id,external_id,handle,admin_url,status,price,currency,actor)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    ON CONFLICT(integration_id,product_id) DO UPDATE SET price_calculation_id=EXCLUDED.price_calculation_id,external_id=EXCLUDED.external_id,handle=EXCLUDED.handle,admin_url=EXCLUDED.admin_url,status=EXCLUDED.status,price=EXCLUDED.price,currency=EXCLUDED.currency,actor=EXCLUDED.actor,updated_at=now()
    RETURNING id,external_id AS "externalId",admin_url AS "adminUrl",status,price::float AS price,currency`,
  [randomUUID(), integrationId, productId, price.id, result.externalId, result.handle, result.adminUrl, result.status, price.suggestedPrice, price.currency, actor])).rows[0];
  await db.query(`INSERT INTO audit_events(id,actor,action,entity_type,entity_id,correlation_id,before_state,after_state,metadata) VALUES($1,$2,$3,'CHANNEL_LISTING',$4,$5,$6,$7,$8)`,
    [randomUUID(), actor, existing ? 'CHANNEL_LISTING_UPDATED' : 'CHANNEL_LISTING_PUBLISHED', listing.id, correlationId, existing ? JSON.stringify(existing) : null, JSON.stringify(listing), JSON.stringify({ integrationId, productId, priceCalculationId: price.id, productVersion: product.version })]);
  return listing;
}
