import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDsProduct } from '../src/lib/providers/aliexpress.ts';
import { supplierMobileContent } from '../src/lib/providers/supplier-content.ts';
const cdn = 'https://ae01.alicdn.com/';
const fixture = mobile_detail => ({ result: {
  ae_item_base_info_dto: { product_id: '123456', subject: 'Óculos', detail: `<p>Descrição completa</p><img src="${cdn}desktop.png">`, mobile_detail },
  ae_multimedia_info_dto: { image_urls: `${cdn}gallery.png` },
  ae_item_sku_info_dtos: { ae_item_sku_info_d_t_o: [{ sku_id: 'sku1', sku_price: '10', sku_available_stock: 2,
    ae_sku_property_dtos: { ae_sku_property_d_t_o: [{ sku_image: '0', sku_property_name: 'color', sku_property_value: 'black' }, { sku_image: '//ae01.alicdn.com/sku-front.png' }, { sku_image: `${cdn}sku-back.png` }] } }] }
} });

test('mobile HTML and every valid SKU property image join gallery without discarding first valid URL after placeholder', () => {
  const p = parseDsProduct(fixture(`<p>Mobile: length: 14 cm</p><img data-src="${cdn}mobile-front.png" alt="Vista frontal"><script><img src="${cdn}script.png"></script>`), '123456', 'BRL');
  assert.deepEqual(p.images, ['gallery.png', 'desktop.png', 'mobile-front.png', 'sku-front.png', 'sku-back.png'].map(n => cdn + n));
  assert.equal(p.variants[0].imageUrl, cdn + 'sku-front.png');
  assert.match(p.description, /Descrição completa/); assert.match(p.description, /Mobile: length: 14 cm/);
  assert.equal(p.dimensions.lengthCm, 14); assert.deepEqual(p.imageLabels, ['Vista frontal']);
  assert.equal(p.importRevision, 3);
});

test('mobile JSON known image and text modules retain refs but ignore arbitrary URLs and unsafe schemes', () => {
  const mobile = JSON.stringify({ version: '2.0', moduleList: [
    { type: 'image', url: cdn + 'mobile-front.png', alt: 'Frontal' },
    { images: [{ imgUrl: cdn + 'mobile-side.png' }, { url: cdn + 'mobile-back.png' }] },
    { type: 'text', content: `<p>Weight: net weight: 20 g</p><img src="${cdn}detail.png">` },
    { type: 'link', url: 'https://unrelated.example/page' },
    { imageUrl: 'javascript:alert(1)' }, { src: 'https://unrelated.example/arbitrary.png' },
    { type: 'image', src: 'https://user:password@example.com/private.png' }
  ] });
  const p = parseDsProduct(fixture(mobile), '123456', 'BRL');
  for (const name of ['mobile-front.png', 'mobile-side.png', 'mobile-back.png', 'detail.png']) assert.ok(p.images.includes(cdn + name));
  assert.ok(p.images.every(url => url.startsWith(cdn)));
  assert.equal(p.weightGrams, 20); assert.deepEqual(p.imageLabels, ['Frontal']);
});

test('JSON image containers, duplicate refs and malformed mobile data remain bounded', () => {
  const p = supplierMobileContent(JSON.stringify({ images: [cdn + 'front.png', { image_url: cdn + 'front.png' }], url: 'https://unrelated.example/page' }));
  assert.deepEqual(p.images, [cdn + 'front.png']);
  assert.deepEqual(supplierMobileContent('{bad-json').images, []);
  assert.throws(() => supplierMobileContent('x'.repeat(2_000_001)), /limite/);
  let nested = {}; for (let i = 0; i < 25; i++) nested = { child: nested };
  assert.throws(() => supplierMobileContent(JSON.stringify(nested)), /estrutura/);
});
