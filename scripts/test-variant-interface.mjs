import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const port = '3101', base = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', port], { env: { ...process.env, DDF_ADMIN_USER: 'interface-test', DDF_ADMIN_PASSWORD: 'local-variant-test-password', DDF_ADMIN_ROLE: 'ADMIN' }, stdio: ['ignore', 'pipe', 'pipe'] });
let output = ''; child.stdout.on('data', data => output += data); child.stderr.on('data', data => output += data);
const auth = `Basic ${Buffer.from('interface-test:local-variant-test-password').toString('base64')}`;
let browser;
const sourceVariant = { sku: 'SKU-PRETO', label: 'Preto / lente cinza', imageUrl: 'https://fixture.invalid/variant-black.png', price: 19, stock: 3, attributes: { Cor: 'Preto', 'Detalhe completo': 'Atributo longo preservado até o fim da informação' }, dimensions: { lengthCm: 14.6, widthCm: 14, heightCm: 3.2 }, weightGrams: 22.6 };
const supplier = { name: 'Fornecedor teste', ref: '1005013226256365', cost: 19, currency: 'BRL', stock: 3, imageUrl: '', images: [], specifications: { 'Proteção declarada': 'UV400' }, variants: [sourceVariant] };
const candidate = (id, status) => ({ id, name: `Óculos ${id}`, url: 'https://www.aliexpress.com/item/1005013226256365.html', notes: '', status, createdAt: '2026-10-11', supplier });
const spec = { variants: [{ ...sourceVariant, id: 'v1', title: sourceVariant.label, gtin: '' }], materials: ['PC'], colors: [], sizes: [], seo: { title: '', description: '' }, compliance: { notes: '', certifications: [] }, localizations: {}, destinationGaps: {} };
const product = (id, status) => ({ id, candidateId: 'raw', universalTitle: `Óculos ${id}`, shortDescription: 'Óculos', longDescription: 'Descrição', category: 'Óculos', bullets: [], benefits: [], tags: [], status, version: 1, createdAt: '2026-10-11', updatedAt: '2026-10-11', spec });
const states = { intake: { version: 1, candidates: [candidate('raw', 'CANDIDATO'), candidate('triage', 'TRIADO'), { ...candidate('legacy', 'CANDIDATO'), supplier: undefined }], events: [] }, products: { version: 1, products: [product('draft', 'EM_PRODUCAO'), product('ready', 'PRONTO'), { ...product('legacy-ready', 'PRONTO'), spec: { ...spec, variants: [] } }], events: [] }, media: { version: 1, assets: [{ id: 'raw-reference', productId: 'ready', kind: 'ORIGINAL', status: 'APROVADA', url: 'https://fixture.invalid/reference.png' }, ...['front', 'back', 'left', 'right'].map(angle => ({ id: angle, productId: 'ready', kind: 'DERIVADA', status: 'APROVADA', studio: true, studioAngle: angle, url: `https://fixture.invalid/${angle}.png`, mimeType: 'image/png', sourceAssetIds: ['raw-reference'], fidelityVerified: true, fidelityEvidence: 'Test fixture only; no real product or generation' }))], events: [] } };
try {
  let started = false;
  for (let attempt = 0; attempt < 80; attempt++) { try { if ((await fetch(`${base}/visao-geral`, { headers: { authorization: auth } })).ok) { started = true; break; } } catch {} await new Promise(resolve => setTimeout(resolve, 250)); }
  assert.ok(started, output);
  browser = await chromium.launch({ headless: true, ...(process.env.DDF_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.DDF_CHROMIUM_EXECUTABLE_PATH } : {}) });
  const context = await browser.newContext({ httpCredentials: { username: 'interface-test', password: 'local-variant-test-password' }, viewport: { width: 1280, height: 900 } });
  await context.route('https://fixture.invalid/**', route => route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6duAAAAAASUVORK5CYII=', 'base64') }));
  await context.route('**/api/state/*', route => { const namespace = new URL(route.request().url()).pathname.split('/').pop(); return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ payload: states[namespace], revision: 1 }) }); });
  const page = await context.newPage();
  for (const [path, name] of [['/prateleira-bruta', 'Abrir detalhes de Óculos raw'], ['/triagem', 'Abrir detalhes de Óculos triage'], ['/product-factory', 'Abrir Óculos draft'], ['/disponiveis', 'Abrir detalhes de Óculos ready']]) {
    await page.goto(base + path);
    await page.getByRole('button', { name, exact: true }).click();
    const section = page.getByRole('region', { name: 'Ficha das variantes', exact: true });
    await section.getByText('SKU: SKU-PRETO', { exact: true }).waitFor();
    await section.getByText('Atributo longo preservado até o fim da informação', { exact: true }).waitFor();
    await section.getByText('22,6 g', { exact: true }).waitFor();
    assert.equal(await section.getByRole('img').getAttribute('src'), sourceVariant.imageUrl, path);
    await page.getByRole('region', { name: 'Dados brutos do fornecedor', exact: true }).getByText('UV400', { exact: true }).waitFor();
    if (path === '/product-factory') {
      assert.equal(await page.getByRole('link', { name: 'Abrir produto original no fornecedor ↗', exact: true }).getAttribute('href'), candidate('raw', 'CANDIDATO').url);
    }
    assert.ok((await section.innerText()).includes('14,6 cm × 14 cm × 3,2 cm'), path);
    await page.getByRole('button', { name: 'Fechar', exact: true }).click();
  }
  await page.goto(base + '/product-factory');
  assert.ok((await page.getByRole('button', { name: 'Abrir Óculos legacy-ready', exact: true }).innerText()).includes('Revisão pendente'));
  assert.ok((await page.getByRole('button', { name: 'Abrir Óculos ready', exact: true }).innerText()).includes('Pronto'));
  await page.getByRole('button', { name: 'Abrir Óculos draft', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: 'Marcar como pronto', exact: true }).isEnabled(), false);
  await page.getByRole('button', { name: 'Fechar', exact: true }).click();
  await page.getByRole('button', { name: 'Abrir Óculos legacy-ready', exact: true }).click();
  await page.getByRole('dialog').getByText('Revisão pendente', { exact: true }).waitFor();
  await page.getByText('Ele permanece fora de Produtos Disponíveis até cumprir os critérios.', { exact: false }).waitFor();
  const originSection = page.getByRole('region', { name: 'Ficha das variantes', exact: true });
  await originSection.getByText('Variantes registradas na origem (1)', { exact: true }).waitFor();
  await originSection.getByText('SKU: SKU-PRETO', { exact: true }).waitFor();
  assert.equal(await originSection.getByRole('img').getAttribute('src'), sourceVariant.imageUrl);
  assert.equal(await page.getByRole('link', { name: 'Abrir produto original no fornecedor ↗', exact: true }).getAttribute('href'), candidate('raw', 'CANDIDATO').url);
  await originSection.getByText('Atributo longo preservado até o fim da informação', { exact: true }).waitFor();
  assert.ok((await originSection.innerText()).includes('ainda não constam na versão salva da ficha'));
  assert.equal(states.products.products.find(item => item.id === 'legacy-ready').spec.variants.length, 0);
  await page.getByRole('button', { name: 'Fechar', exact: true }).click();
  await page.goto(base + '/disponiveis');
  assert.equal(await page.getByRole('button', { name: 'Abrir detalhes de Óculos legacy-ready', exact: true }).count(), 0);
  await page.getByRole('button', { name: 'Abrir detalhes de Óculos ready', exact: true }).waitFor();
  await page.goto(base + '/prateleira-bruta');
  await page.getByRole('button', { name: 'Abrir detalhes de Óculos legacy', exact: true }).click();
  await page.getByText('Variantes ainda não registradas nesta ficha.', { exact: false }).waitFor();
  console.log('Interface variants: raw shelf, triage, factory, ready catalog and legacy missing-data state passed.');
} finally { await browser?.close(); child.kill('SIGTERM'); }
