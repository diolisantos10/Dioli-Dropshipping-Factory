import { randomUUID } from 'node:crypto';
import { aliExpressTokenSecrets, consumeOAuthState, decryptIntegrationSecrets, storeIntegrationCredentials, testIntegration } from '@/lib/integrations';
import { aliExpressCredentialsFrom, exchangeAliExpressCode } from '@/lib/providers/aliexpress';
import { exchangeShopifyCode, normalizeShopDomain, verifyShopifyHmac } from '@/lib/providers/shopify';
import { getDatabasePool } from '@/lib/server-state';
import { publicBaseUrl } from '@/lib/request-context';
export const runtime = 'nodejs';

function back(request: Request, params: Record<string, string>) {
  const url = new URL('/integracoes', publicBaseUrl(request));
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value.slice(0, 300));
  return Response.redirect(url.href, 303);
}

export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const query = new URL(request.url).searchParams;
  const providerError = query.get('error_description') || query.get('error');
  const pending = await consumeOAuthState(query.get('state') ?? '', provider).catch(() => null);
  if (!pending) return back(request, { oauthError: 'Autorização expirada ou inválida. Inicie a conexão novamente.' });
  if (providerError) return back(request, { oauthError: `Autorização recusada: ${providerError}` });
  const code = query.get('code') ?? '';
  const correlationId = randomUUID();
  const actor = pending.actor || 'admin:oauth';
  try {
    const db = await getDatabasePool();
    const row = (await db.query('SELECT * FROM integration_configs WHERE id=$1', [pending.integrationId])).rows[0];
    if (!row) return back(request, { oauthError: 'Integração não encontrada.' });
    const secrets = decryptIntegrationSecrets(row.encrypted_secrets);
    if (provider === 'aliexpress') {
      const token = await exchangeAliExpressCode(aliExpressCredentialsFrom(row.config ?? {}, secrets), code);
      await storeIntegrationCredentials(row.id, { secrets: aliExpressTokenSecrets(token), expiresAt: token.expiresAt, account: token.account || token.sellerId || null, resetStatus: true }, actor, correlationId, 'INTEGRATION_OAUTH_CONNECTED');
    } else if (provider === 'shopify') {
      const clientId = row.config?.clientId || process.env.SHOPIFY_CLIENT_ID || '';
      const clientSecret = secrets.clientSecret || process.env.SHOPIFY_CLIENT_SECRET || '';
      if (!verifyShopifyHmac(query, clientSecret)) return back(request, { oauthError: 'Assinatura HMAC da Shopify inválida.' });
      const shop = normalizeShopDomain(query.get('shop') ?? '');
      if (pending.shop && shop !== pending.shop) return back(request, { oauthError: 'A loja autorizada difere da loja solicitada.' });
      const token = await exchangeShopifyCode(shop, clientId, clientSecret, code);
      await storeIntegrationCredentials(row.id, { secrets: { accessToken: token.accessToken }, config: { storeDomain: shop, authMode: 'oauth', scopes: token.scope }, expiresAt: token.expiresAt || null, account: shop, resetStatus: true }, actor, correlationId, 'INTEGRATION_OAUTH_CONNECTED');
    } else {
      return back(request, { oauthError: 'Provedor desconhecido.' });
    }
    const result = await testIntegration(row.id);
    return back(request, result?.success ? { connected: provider } : { oauthError: result?.message ?? 'Conectado, mas o teste falhou.' });
  } catch (error) {
    return back(request, { oauthError: error instanceof Error ? error.message : 'Falha ao concluir a conexão.' });
  }
}
