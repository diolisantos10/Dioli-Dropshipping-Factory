import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import {
  createShopifyAdapter, normalizeShopDomain, parseShopifyOrders, productSetVariables, shopifyAuthorizeUrl,
  shopifyClientCredentialsToken, verifyShopifyHmac,
} from '../src/lib/providers/shopify.ts';

test('domínio da loja é normalizado e restrito a myshopify.com', () => {
  assert.equal(normalizeShopDomain('https://Minha-Loja.myshopify.com/admin'), 'minha-loja.myshopify.com');
  assert.equal(normalizeShopDomain('minha-loja'), 'minha-loja.myshopify.com');
  assert.throws(() => normalizeShopDomain('evil.example.com'), /myshopify/);
  assert.throws(() => normalizeShopDomain('a.myshopify.com.evil.com'), /myshopify/);
});

test('HMAC do callback OAuth é verificado sobre parâmetros ordenados sem hmac', () => {
  const secret = 'shpss_test';
  const params = new URLSearchParams({ code: 'abc123def', shop: 'loja.myshopify.com', state: 'st', timestamp: '1700000000' });
  const message = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('&');
  params.set('hmac', createHmac('sha256', secret).update(message).digest('hex'));
  assert.equal(verifyShopifyHmac(params, secret), true);
  params.set('shop', 'outra.myshopify.com');
  assert.equal(verifyShopifyHmac(params, secret), false);
  assert.equal(verifyShopifyHmac(new URLSearchParams({ hmac: 'zz' }), secret), false);
});

test('URL de autorização pede somente os escopos necessários', () => {
  const url = new URL(shopifyAuthorizeUrl('loja', 'client', 'https://ddf.test/cb', 'state'));
  assert.equal(url.origin + url.pathname, 'https://loja.myshopify.com/admin/oauth/authorize');
  assert.equal(url.searchParams.get('scope'), 'write_products,read_orders,read_publications,write_publications');
  assert.equal(url.searchParams.get('state'), 'state');
});

test('client credentials envia form-urlencoded e calcula expiração de 24h', async (t) => {
  let captured;
  t.mock.method(globalThis, 'fetch', async (url, init) => { captured = { url, init }; return new Response(JSON.stringify({ access_token: 'shpat_x', scope: 'write_products', expires_in: 86399 }), { status: 200 }); });
  const token = await shopifyClientCredentialsToken('loja.myshopify.com', 'id', 'secret', Date.parse('2026-09-25T00:00:00Z'));
  assert.equal(captured.url, 'https://loja.myshopify.com/admin/oauth/access_token');
  assert.equal(new URLSearchParams(captured.init.body).get('grant_type'), 'client_credentials');
  assert.equal(token.accessToken, 'shpat_x');
  assert.equal(token.expiresAt, '2026-09-25T23:59:59.000Z');
});

test('productSet cria sempre como DRAFT e atualiza por identifier', () => {
  const input = { externalId: null, title: ' Óculos ', descriptionHtml: '<p>x</p>', productType: 'Acessórios', tags: ['a', 'a', ' '], vendor: 'DDF', sku: 'SKU-1', price: 99.9, currency: 'BRL', imageUrls: ['https://img/a.jpg', 'http://inseguro/b.jpg'] };
  const created = productSetVariables(input);
  assert.equal(created.input.status, 'DRAFT');
  assert.equal(created.input.title, 'Óculos');
  assert.deepEqual(created.input.tags, ['a']);
  assert.equal(created.input.variants[0].price, '99.90');
  assert.equal(created.input.files.length, 1);
  assert.equal(created.identifier, undefined);
  assert.deepEqual(productSetVariables({ ...input, externalId: 'gid://shopify/Product/1' }).identifier, { id: 'gid://shopify/Product/1' });
  assert.throws(() => productSetVariables({ ...input, price: 0 }), /Preço/);
});

test('adapter usa Admin GraphQL versionado e trata userErrors', async (t) => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ data: { productSet: { product: null, userErrors: [{ field: ['title'], message: 'Title is invalid' }] } } }), { status: 200 });
  });
  const adapter = createShopifyAdapter({ storeDomain: 'loja.myshopify.com' }, { accessToken: 'shpat_x' });
  await assert.rejects(adapter.upsertListing({ externalId: null, title: 'x', descriptionHtml: '', productType: '', tags: [], vendor: 'DDF', sku: 's', price: 10, currency: 'BRL', imageUrls: [] }), /Title is invalid/);
  assert.equal(calls[0].url, 'https://loja.myshopify.com/admin/api/2026-07/graphql.json');
  assert.equal(calls[0].init.headers['X-Shopify-Access-Token'], 'shpat_x');
});

test('teste de conexão retorna nome da loja e falha sem vazar token', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ data: { shop: { name: 'Loja Dioli', currencyCode: 'BRL' } } }), { status: 200 }));
  assert.deepEqual(await createShopifyAdapter({ storeDomain: 'loja' }, { accessToken: 't' }).test(), { ok: true, message: 'Loja Shopify autenticada: Loja Dioli (BRL).' });
  t.mock.method(globalThis, 'fetch', async () => new Response('', { status: 401 }));
  const failed = await createShopifyAdapter({ storeDomain: 'loja' }, { accessToken: 'segredo' }).test();
  assert.equal(failed.ok, false);
  assert.equal(failed.message.includes('segredo'), false);
});

test('pedidos são mapeados com linhas, produto e total', () => {
  const [order] = parseShopifyOrders({ orders: { nodes: [{ id: 'gid://shopify/Order/5', name: '#1001', createdAt: '2026-09-25T00:00:00Z', cancelledAt: null, displayFinancialStatus: 'PAID', totalPriceSet: { shopMoney: { amount: '199.80', currencyCode: 'BRL' } }, lineItems: { nodes: [{ sku: 'S', quantity: 2, product: { id: 'gid://shopify/Product/1' }, originalUnitPriceSet: { shopMoney: { amount: '99.90' } } }] } }] } });
  assert.equal(order.total, 199.8);
  assert.equal(order.cancelled, false);
  assert.deepEqual(order.lines[0], { externalProductId: 'gid://shopify/Product/1', sku: 'S', quantity: 2, unitPrice: 99.9 });
});

test('canais de venda: padrão Headless, casa pelo título e publica sem falhar a listagem', async (t) => {
  const { parseSalesChannels, matchPublications, publishToSalesChannels } = await import('../src/lib/providers/shopify.ts');
  assert.deepEqual(parseSalesChannels(undefined), ['headless']);
  assert.deepEqual(parseSalesChannels(' Headless , Online Store ,headless'), ['headless', 'online store']);
  const pubs = [{ id: 'gid://shopify/Publication/1', title: 'Online Store' }, { id: 'gid://shopify/Publication/2', title: 'Santioh Headless' }];
  assert.deepEqual(matchPublications(pubs, ['headless']), { matched: [pubs[1]], missing: [] });
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    const body = JSON.parse(init.body); calls.push(body);
    if (body.query.includes('ddfPublications')) return new Response(JSON.stringify({ data: { publications: { nodes: [{ id: 'gid://shopify/Publication/2', catalog: { title: 'Santioh Headless' } }] } } }), { status: 200 });
    return new Response(JSON.stringify({ data: { publishablePublish: { userErrors: [] } } }), { status: 200 });
  });
  const ok = await publishToSalesChannels('loja.myshopify.com', 't', '2026-07', 'gid://shopify/Product/9', ['headless']);
  assert.deepEqual(ok, { salesChannels: ['Santioh Headless'], warnings: [] });
  assert.deepEqual(calls[1].variables, { id: 'gid://shopify/Product/9', input: [{ publicationId: 'gid://shopify/Publication/2' }] });
  t.mock.method(globalThis, 'fetch', async () => new Response('', { status: 403 }));
  const denied = await publishToSalesChannels('loja.myshopify.com', 't', '2026-07', 'gid://shopify/Product/9', ['headless']);
  assert.equal(denied.salesChannels.length, 0);
  assert.match(denied.warnings[0], /reconecte a Shopify/);
});
