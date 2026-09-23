import test from 'node:test';
import assert from 'node:assert/strict';
import { callAliExpressApi, createAliExpressAdapter, signAliExpressParams } from '../src/lib/providers/aliexpress.ts';

test('assinatura TOP usa HMAC-MD5 em parâmetros ordenados', () => {
  assert.equal(
    signAliExpressParams({ timestamp: '2015-01-01 12:00:00', app_key: '123', method: 'demo' }, 'secret'),
    '1FF733C8DC6BCE8A386BBAC4752B46D5',
  );
});

test('chamada usa gateway TOP, session e parâmetros obrigatórios sem vazar segredo', async (t) => {
  let captured;
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    captured = { url, init };
    return new Response(JSON.stringify({ demo_response: { ok: true } }), { status: 200 });
  });
  await callAliExpressApi('demo', 'key', 'secret', 'token', { product_id: '42' });
  assert.equal(captured.url, 'https://eco.taobao.com/router/rest');
  const body = new URLSearchParams(captured.init.body);
  assert.equal(body.get('session'), 'token');
  assert.equal(body.get('access_token'), null);
  assert.equal(body.get('sign_method'), 'hmac');
  assert.equal(body.get('format'), 'json');
  assert.equal(body.get('v'), '2.0');
  assert.match(body.get('timestamp'), /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  assert.equal(captured.init.body.includes('secret'), false);
});

test('erros de negócio não são tratados como sucesso', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({
    error_response: { code: 27, sub_code: 'invalid-session', sub_msg: 'Token expirado' },
  }), { status: 200 }));
  await assert.rejects(
    callAliExpressApi('demo', 'key', 'secret', 'token'),
    /AliExpress invalid-session: Token expirado/,
  );
});

test('produto usa menor preço em estoque e moeda retornada pela API', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({
    aliexpress_ds_product_get_response: { result: {
      ae_item_base_info_dto: { product_id: 123, subject: 'Produto', currency_code: 'BRL' },
      ae_item_multimedia_info_dto: { image_urls: ['https://img.test/a.jpg'] },
      ae_item_sku_info_dtos: { ae_item_sku_info_d_t_o: [
        { sku_stock: false, sku_price: '10' }, { sku_stock: true, sku_price: '25' }, { sku_stock: true, sku_price: '20' },
      ] },
    } },
  }), { status: 200 }));
  const adapter = createAliExpressAdapter({ appKey: 'key' }, { appSecret: 'secret', accessToken: 'token' }, 'PRODUCTION');
  const product = await adapter.getProduct('123');
  assert.equal(product.price, 20);
  assert.equal(product.currency, 'BRL');
  assert.equal(product.stock, undefined);
  assert.equal(product.imageUrl, 'https://img.test/a.jpg');
});

test('teste de conexão exige produto para validar o token', async () => {
  const adapter = createAliExpressAdapter({ appKey: 'key' }, { appSecret: 'secret', accessToken: 'token' }, 'PRODUCTION');
  assert.deepEqual(await adapter.test(), { ok: false, message: 'Informe um ID de produto de teste para validar o Access Token.' });
});
