import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aliExpressAuthorizeUrl, callAliExpressBusiness, callAliExpressSystem, createAliExpressAdapter, normalizeAliExpressToken,
  parseDsProduct, parseDsSearchProducts, signAliExpressRequest, tokenNeedsRefresh,
} from '../src/lib/providers/aliexpress.ts';

const creds = { appKey: 'key', appSecret: 'secret', accessToken: 'token' };

test('assinatura HMAC-SHA256 confere com o vetor oficial de interface de sistema', () => {
  assert.equal(
    signAliExpressRequest({ app_key: '12345678', code: '3_500102_JxZ05Ux3cnnSSUm6dCxYg6Q26', sign_method: 'sha256', timestamp: '1517820392000' }, 'helloworld', '/auth/token/create'),
    '35607762342831B6A417A0DED84B79C05FEFBF116969C48AD6DC00279A9F4D81',
  );
});

test('assinatura HMAC-SHA256 confere com o vetor oficial de interface de negócio (method assinado)', () => {
  assert.equal(
    signAliExpressRequest({ access_token: 'test', aliexpress_category_id: '200135143', app_key: '123456', method: 'aliexpress.logistics.redefining.getonlinelogisticsinfo', sign_method: 'sha256', timestamp: '1517820392000' }, 'helloworld'),
    'F7F7926B67316C9D1E8E15F7E66940ED3059B1638C497D77973F30046EFB5BBB',
  );
});

test('assinatura ignora sign e parâmetros vazios', () => {
  const base = { app_key: 'a', method: 'm', timestamp: '1' };
  assert.equal(signAliExpressRequest({ ...base, sign: 'x', empty: '' }, 's'), signAliExpressRequest(base, 's'));
});

test('chamada de negócio usa gateway api-sg /sync com sha256, access_token e timestamp em ms', async (t) => {
  let captured;
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    captured = { url, init };
    return new Response(JSON.stringify({ aliexpress_ds_text_search_response: { code: '0', data: {} } }), { status: 200 });
  });
  await callAliExpressBusiness('aliexpress.ds.text.search', creds, { keyWord: 'x' }, 1_700_000_000_000);
  assert.equal(captured.url, 'https://api-sg.aliexpress.com/sync');
  const body = new URLSearchParams(captured.init.body);
  assert.equal(body.get('method'), 'aliexpress.ds.text.search');
  assert.equal(body.get('access_token'), 'token');
  assert.equal(body.get('session'), null);
  assert.equal(body.get('sign_method'), 'sha256');
  assert.equal(body.get('timestamp'), '1700000000000');
  const params = Object.fromEntries([...body.entries()].filter(([key]) => key !== 'sign'));
  assert.equal(body.get('sign'), signAliExpressRequest(params, 'secret'));
  assert.equal(captured.init.body.includes('secret'), false);
});

test('erros do gateway e rsp_code de negócio não são tratados como sucesso', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ error_response: { code: 'IllegalAccessToken', msg: 'Token expirado' } }), { status: 200 }));
  await assert.rejects(callAliExpressBusiness('demo', creds), /AliExpress IllegalAccessToken: Token expirado/);
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ aliexpress_ds_product_get_response: { rsp_code: 405, rsp_msg: 'produto indisponível' } }), { status: 200 }));
  await assert.rejects(callAliExpressBusiness('aliexpress.ds.product.get', creds), /AliExpress 405: produto indisponível/);
});

test('interface de sistema usa /rest{path}, assina com o path e lê erro no topo', async (t) => {
  let captured;
  t.mock.method(globalThis, 'fetch', async (url, init) => { captured = { url, init }; return new Response(JSON.stringify({ code: 'IllegalTimestamp', message: 'timestamp inválido' }), { status: 200 }); });
  await assert.rejects(callAliExpressSystem('/auth/token/create', creds, { code: 'abc123' }, 1517820392000), /IllegalTimestamp/);
  assert.equal(captured.url, 'https://api-sg.aliexpress.com/rest/auth/token/create');
  const body = new URLSearchParams(captured.init.body);
  assert.equal(body.get('access_token'), null);
  assert.equal(body.get('sign'), signAliExpressRequest({ app_key: 'key', code: 'abc123', sign_method: 'sha256', timestamp: '1517820392000' }, 'secret', '/auth/token/create'));
});

test('URL de autorização segue o fluxo code-for-token', () => {
  const url = new URL(aliExpressAuthorizeUrl('key', 'https://ddf.test/cb', 'state123'));
  assert.equal(url.origin + url.pathname, 'https://api-sg.aliexpress.com/oauth/authorize');
  assert.equal(url.searchParams.get('client_id'), 'key');
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('redirect_uri'), 'https://ddf.test/cb');
  assert.equal(url.searchParams.get('state'), 'state123');
});

test('token normaliza expirações absolutas ou relativas', () => {
  const now = Date.parse('2026-09-25T00:00:00Z');
  const relative = normalizeAliExpressToken({ access_token: 'a', refresh_token: 'r', expires_in: 3600, refresh_expires_in: 7200, account: 'x@y' }, now);
  assert.equal(relative.expiresAt, '2026-09-25T01:00:00.000Z');
  assert.equal(relative.refreshExpiresAt, '2026-09-25T02:00:00.000Z');
  const absolute = normalizeAliExpressToken({ access_token: 'a', expire_time: now + 1000 }, now);
  assert.equal(absolute.expiresAt, new Date(now + 1000).toISOString());
  assert.throws(() => normalizeAliExpressToken({}, now), /access_token/);
  assert.equal(tokenNeedsRefresh(new Date(now + 3_600_000).toISOString(), now), true);
  assert.equal(tokenNeedsRefresh(new Date(now + 3 * 86_400_000).toISOString(), now), false);
});

test('busca ds.text.search mapeia produtos, prioriza preço na moeda alvo e aceita lista embrulhada', () => {
  const products = parseDsSearchProducts({ data: { products: { selection_search_product: [
    { itemId: '1005001', title: 'Óculos', targetSalePrice: '32.90', targetOriginalPriceCurrency: 'BRL', salePrice: '6.62', salePriceCurrency: 'USD', itemMainPic: '//ae01.alicdn.com/a.jpg', itemUrl: '//www.aliexpress.com/item/1005001.html' },
    { itemId: '1005002', title: 'Sem alvo', salePrice: 'US $6.62', salePriceCurrency: 'USD' },
    { itemId: 'abc', title: 'inválido', salePrice: '1' },
  ] } } }, 'BRL');
  assert.equal(products.length, 2);
  assert.deepEqual(products[0], { itemId: '1005001', title: 'Óculos', price: 32.9, currency: 'BRL', imageUrl: 'https://ae01.alicdn.com/a.jpg', detailUrl: 'https://www.aliexpress.com/item/1005001.html' });
  assert.equal(products[1].price, 6.62);
  assert.equal(products[1].currency, 'USD');
});

test('produto ds.product.get usa menor preço disponível, soma estoque e lê imagens separadas por ;', () => {
  const product = parseDsProduct({ result: {
    ae_item_base_info_dto: { product_id: 123, subject: 'Produto', currency_code: 'USD' },
    ae_multimedia_info_dto: { image_urls: 'https://img.test/a.jpg;https://img.test/b.jpg' },
    ae_item_sku_info_dtos: { ae_item_sku_info_d_t_o: [
      { sku_available_stock: 0, sku_price: '5', currency_code: 'BRL' },
      { sku_available_stock: 3, sku_price: '25', offer_sale_price: '22', currency_code: 'BRL' },
      { sku_available_stock: 4, sku_price: '20', currency_code: 'BRL' },
    ] },
    logistics_info_dto: { delivery_time: 12 },
  } }, '123', 'BRL');
  assert.equal(product.price, 20);
  assert.equal(product.currency, 'BRL');
  assert.equal(product.stock, 7);
  assert.equal(product.imageUrl, 'https://img.test/a.jpg');
  assert.equal(product.shippingTime, '12 dias');
});

test('produto sem estoque em nenhum SKU retorna estoque zero', () => {
  const product = parseDsProduct({ result: { ae_item_base_info_dto: { product_id: 9, subject: 'X' }, ae_item_sku_info_dtos: [{ sku_available_stock: 0, sku_price: '10' }] } }, '9', 'BRL');
  assert.equal(product.stock, 0);
  assert.equal(product.price, 10);
});

test('adapter busca via método de dropshipping aliexpress.ds.text.search', async (t) => {
  let body;
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    body = new URLSearchParams(init.body);
    return new Response(JSON.stringify({ aliexpress_ds_text_search_response: { code: '0', data: { products: [{ itemId: '1005009', title: 'Item', targetSalePrice: '10.00', targetOriginalPriceCurrency: 'BRL' }] } } }), { status: 200 });
  });
  const adapter = createAliExpressAdapter({ appKey: 'key', shipToCountry: 'br', currency: 'BRL', language: 'pt' }, { appSecret: 'secret', accessToken: 'token' }, 'PRODUCTION');
  const result = await adapter.searchProducts(' óculos ', { page: 2, pageSize: 99 });
  assert.equal(body.get('method'), 'aliexpress.ds.text.search');
  assert.equal(body.get('keyWord'), 'óculos');
  assert.equal(body.get('countryCode'), 'BR');
  assert.equal(body.get('local'), 'pt_BR');
  assert.equal(body.get('pageIndex'), '2');
  assert.equal(body.get('pageSize'), '50');
  assert.equal(result[0].itemId, '1005009');
});

test('credenciais do app vêm do servidor quando a integração não as define', async (t) => {
  const previous = { key: process.env.ALIEXPRESS_APP_KEY, secret: process.env.ALIEXPRESS_APP_SECRET };
  process.env.ALIEXPRESS_APP_KEY = 'env-key'; process.env.ALIEXPRESS_APP_SECRET = 'env-secret';
  t.after(() => { process.env.ALIEXPRESS_APP_KEY = previous.key; process.env.ALIEXPRESS_APP_SECRET = previous.secret; if (previous.key === undefined) delete process.env.ALIEXPRESS_APP_KEY; if (previous.secret === undefined) delete process.env.ALIEXPRESS_APP_SECRET; });
  let body;
  t.mock.method(globalThis, 'fetch', async (_url, init) => { body = new URLSearchParams(init.body); return new Response(JSON.stringify({ aliexpress_ds_text_search_response: { code: '0', data: { products: [] } } }), { status: 200 }); });
  const result = await createAliExpressAdapter({}, { accessToken: 'token' }, 'PRODUCTION').test();
  assert.equal(result.ok, true);
  assert.equal(body.get('app_key'), 'env-key');
});

test('teste sem token orienta a conectar a conta', async () => {
  const result = await createAliExpressAdapter({ appKey: 'key' }, { appSecret: 'secret' }, 'PRODUCTION').test();
  assert.equal(result.ok, false);
  assert.match(result.message, /Conecte a conta AliExpress/);
});
