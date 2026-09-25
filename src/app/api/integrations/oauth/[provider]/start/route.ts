import { createOAuthState, findOrCreateProviderIntegration } from '@/lib/integrations';
import { aliExpressAuthorizeUrl } from '@/lib/providers/aliexpress';
import { normalizeShopDomain, shopifyAuthorizeUrl } from '@/lib/providers/shopify';
import { getDatabasePool } from '@/lib/server-state';
import { forbidden, hasRole, oauthCallbackUrl, requestActor, requestCorrelationId } from '@/lib/request-context';
export const runtime = 'nodejs';

const SUPPLIER_CAPABILITIES = ['catalog.read', 'cost.read', 'inventory.read'];
const CHANNEL_CAPABILITIES = ['listing.write', 'price.write', 'order.read'];

export async function POST(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  if (!hasRole(request, ['ADMIN'])) return forbidden();
  const { provider } = await params;
  const actor = requestActor(request, 'admin:integrations');
  const correlationId = requestCorrelationId(request);
  try {
    const body = await request.json().catch(() => ({})) as { integrationId?: string; shop?: string; name?: string };
    const integrationId = typeof body.integrationId === 'string' && /^[0-9a-f-]{36}$/i.test(body.integrationId) ? body.integrationId : null;
    if (provider === 'aliexpress') {
      const appKey = process.env.ALIEXPRESS_APP_KEY?.trim();
      if (!appKey || !process.env.ALIEXPRESS_APP_SECRET?.trim()) return Response.json({ error: 'Configure ALIEXPRESS_APP_KEY e ALIEXPRESS_APP_SECRET no servidor.' }, { status: 503 });
      const id = await findOrCreateProviderIntegration({ kind: 'SUPPLIER', providerKey: 'aliexpress', name: body.name?.trim() || 'AliExpress', config: { shipToCountry: 'BR', currency: 'BRL', language: 'pt' }, capabilities: SUPPLIER_CAPABILITIES }, integrationId, actor, correlationId);
      const state = await createOAuthState('aliexpress', id, actor);
      return Response.json({ url: aliExpressAuthorizeUrl(appKey, oauthCallbackUrl(request, 'aliexpress'), state), integrationId: id });
    }
    if (provider === 'shopify') {
      const shop = normalizeShopDomain(String(body.shop ?? ''));
      let clientId = process.env.SHOPIFY_CLIENT_ID?.trim() ?? '';
      if (integrationId) {
        const db = await getDatabasePool();
        const row = (await db.query(`SELECT config FROM integration_configs WHERE id=$1 AND provider_key='shopify'`, [integrationId])).rows[0];
        clientId = row?.config?.clientId?.trim() || clientId;
      }
      if (!clientId) return Response.json({ error: 'Configure SHOPIFY_CLIENT_ID/SHOPIFY_CLIENT_SECRET no servidor ou informe Client ID e Client Secret na integração.' }, { status: 503 });
      const id = await findOrCreateProviderIntegration({ kind: 'CHANNEL', providerKey: 'shopify', name: body.name?.trim() || `Shopify · ${shop}`, config: { storeDomain: shop, authMode: 'oauth' }, capabilities: CHANNEL_CAPABILITIES }, integrationId, actor, correlationId);
      const state = await createOAuthState('shopify', id, actor, shop);
      return Response.json({ url: shopifyAuthorizeUrl(shop, clientId, oauthCallbackUrl(request, 'shopify'), state), integrationId: id });
    }
    return Response.json({ error: 'Provedor sem fluxo de conexão.' }, { status: 404 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Não foi possível iniciar a conexão.' }, { status: 400 });
  }
}
