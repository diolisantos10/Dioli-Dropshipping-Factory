import test from 'node:test';
import assert from 'node:assert/strict';
import { ACTIVE_STATES, candidateCard, filterCards, parseLegacyNotes, productCard, suggestedPriceOf, suppliersOf } from '../src/lib/storefront.ts';
import { assignProduct, catalogRecords, curateProducts, emptyCatalog, addSupplierOffer } from '../src/lib/catalog.ts';

const candidate = (id, extra = {}) => ({ id, name: `Produto ${id}`, url: `https://www.aliexpress.com/item/${id}.html`, notes: '', status: 'CANDIDATO', createdAt: '2026-09-01T00:00:00Z', ...extra });
const supplier = (cost, name = 'AliExpress principal') => ({ name, ref: '1005', cost, currency: 'USD', stock: 12, imageUrl: 'https://ae01.alicdn.com/a.jpg', images: ['https://ae01.alicdn.com/a.jpg', 'https://ae01.alicdn.com/b.jpg'], variants: [{ sku: 's1', label: 'Preto', price: 9.5, stock: 4, imageUrl: '' }] });

test('card de candidato mostra foto, custo, estoque, fornecedor, todas as fotos e variantes', () => {
  const card = candidateCard(candidate('1', { name: 'Curto…', fullName: 'Nome completo e longo', supplier: supplier(9.5) }));
  assert.equal(card.imageUrl, 'https://ae01.alicdn.com/a.jpg');
  assert.equal(card.images.length, 2);
  assert.equal(card.cost, 9.5); assert.equal(card.currency, 'USD'); assert.equal(card.stock, 12);
  assert.equal(card.supplier, 'AliExpress principal');
  assert.equal(card.title, 'Curto…'); assert.equal(card.fullTitle, 'Nome completo e longo');
  assert.equal(card.variants[0].label, 'Preto');
  assert.equal(card.suggestedPrice, null);
});

test('candidato antigo sem dados estruturados é lido das observações', () => {
  const notes = 'Fornecedor: AliExpress BR\nReferência: 1005001\nCusto informado: USD 12.50\nEstoque: 8\nImagem: https://ae01.alicdn.com/x.jpg';
  assert.deepEqual(parseLegacyNotes(notes), { supplier: 'AliExpress BR', ref: '1005001', cost: 12.5, currency: 'USD', stock: 8, imageUrl: 'https://ae01.alicdn.com/x.jpg' });
  const card = candidateCard(candidate('2', { notes }));
  assert.equal(card.cost, 12.5); assert.equal(card.supplier, 'AliExpress BR'); assert.equal(card.imageUrl, 'https://ae01.alicdn.com/x.jpg');
  assert.equal(parseLegacyNotes('Estoque: não informado').stock, null);
});

test('filtros combinam busca, faixa de custo, fornecedor e estado', () => {
  const cards = [
    candidateCard(candidate('a', { supplier: supplier(5, 'Fornecedor A') })),
    candidateCard(candidate('b', { supplier: supplier(20, 'Fornecedor B'), status: 'TRIADO' })),
    candidateCard(candidate('c', { status: 'ARQUIVADO' })),
  ];
  assert.deepEqual(filterCards(cards, { minCost: '4', maxCost: '10' }).map(card => card.id), ['a']);
  assert.deepEqual(filterCards(cards, { maxCost: '25,00' }).map(card => card.id), ['a', 'b']);
  assert.deepEqual(filterCards(cards, { supplier: 'Fornecedor B' }).map(card => card.id), ['b']);
  assert.deepEqual(filterCards(cards, { state: 'TRIADO' }).map(card => card.id), ['b']);
  assert.deepEqual(filterCards(cards, { state: ACTIVE_STATES }).map(card => card.id), ['a', 'b']);
  assert.deepEqual(filterCards(cards, { query: 'produto a' }).map(card => card.id), ['a']);
  assert.deepEqual(filterCards(cards, { minCost: 'abc' }).length, 3);
  assert.deepEqual(suppliersOf(cards), ['Fornecedor A', 'Fornecedor B', 'Manual']);
});

test('card de produto pronto usa mídia aprovada, menor oferta, preço aprovado e curadoria', () => {
  const product = { id: 'p1', candidateId: 'c1', status: 'PRONTO', version: 2, universalTitle: 'Óculos', shortDescription: 'Leve', longDescription: 'Óculos em acetato com lentes azuis.', category: 'Moda', bullets: [], benefits: [], tags: ['uv'], spec: { materials: ['Acetato'], variants: [{ id: 'v1', sku: 'OC-1', title: 'Preto', gtin: '', attributes: { cor: 'preto' }, dimensions: { lengthCm: 15, widthCm: 14, heightCm: 5 }, weightGrams: 30 }], destinationGaps: {} }, createdAt: 'now', updatedAt: 'now' };
  let catalog = addSupplierOffer(emptyCatalog, { productId: 'p1', supplierName: 'Caro', supplierRef: 'X', cost: 30, currency: 'BRL', stock: 2, leadTimeDays: 5 }, 'o1', 'now');
  catalog = addSupplierOffer(catalog, { productId: 'p1', supplierName: 'Barato', supplierRef: 'Y', cost: 18, currency: 'BRL', stock: 3, leadTimeDays: 9 }, 'o2', 'now');
  catalog = curateProducts(catalog, ['p1'], 'APROVADO', 'Vitrine ok', 'dioli', 'now');
  const media = [
    { id: 'raw', productId: 'p1', url: 'https://cdn.test/original.jpg', status: 'APROVADA', kind: 'ORIGINAL' },
    ...['front', 'back', 'left', 'right'].map((angle, index) => ({ id: `m${index}`, productId: 'p1', url: `https://cdn.test/${angle}.jpg`, mimeType: 'image/jpeg', status: 'APROVADA', kind: 'DERIVADA', studio: true, studioAngle: angle, originalAssetId: 'raw', sourceAssetIds: ['raw'], fidelityVerified: true, fidelityEvidence: 'Todos os detalhes conferidos', rightsStatus: 'DECLARADO' })),
  ];
  const prices = [
    { id: 'x1', productId: 'p1', suggestedPrice: 59.9, currency: 'BRL', status: 'CALCULADO', approval: 'APROVADO', at: '2026-09-01' },
    { id: 'x2', productId: 'p1', suggestedPrice: 64.9, currency: 'BRL', status: 'CALCULADO', approval: 'PENDENTE', at: '2026-09-02' },
  ];
  const [record] = catalogRecords(catalog, [product], media, prices, []);
  const card = productCard(record, candidate('c1', { supplier: supplier(3) }), catalog.curation[0].status);
  assert.equal(card.imageUrl, 'https://cdn.test/front.jpg');
  assert.ok(!card.images.includes('https://cdn.test/video.mp4'));
  assert.ok(!card.images.includes('https://ae01.alicdn.com/b.jpg'));
  assert.equal(card.images.length, 4);
  assert.equal(card.cost, 18); assert.equal(card.supplier, 'Barato'); assert.equal(card.stock, 5);
  assert.equal(card.suggestedPrice, 59.9);
  assert.equal(card.state, 'APROVADO');
  assert.match(card.variants[0].detail, /OC-1/);
});

test('preço bloqueado nunca aparece como sugerido', () => {
  assert.equal(suggestedPriceOf([{ suggestedPrice: null, status: 'BLOQUEADO', approval: 'PENDENTE', at: '1', currency: 'BRL' }]), null);
});

test('curadoria em massa guarda só a última decisão por produto e exige justificativa', () => {
  let catalog = assignProduct(emptyCatalog, 'p1', { brandIds: [], storeIds: [], destinations: [] }, 'now');
  catalog = curateProducts(catalog, ['p1', 'p2', 'p1'], 'ARQUIVADO', 'Fora de linha', 'dioli', 't1');
  catalog = curateProducts(catalog, ['p2'], 'APROVADO', 'Voltou', 'dioli', 't2');
  assert.deepEqual(catalog.curation.map(item => `${item.productId}:${item.status}`).sort(), ['p1:ARQUIVADO', 'p2:APROVADO']);
  assert.throws(() => curateProducts(catalog, ['p1'], 'APROVADO', ' ', 'dioli', 't3'), /justificativa/);
  assert.throws(() => curateProducts(catalog, [], 'APROVADO', 'x', 'dioli', 't3'), /Selecione/);
});

test('ficha bruta separa descrição do fornecedor das observações e mantém detalhes completos', () => {
  const source = { ...supplier(5), description: 'Descrição técnica original', specifications: { Material: 'Acetato' }, rawData: { custom: 'preservado' } };
  const card = candidateCard(candidate('technical', { notes: 'Selecionar depois', supplier: source }));
  assert.equal(card.description, 'Descrição técnica original');
  assert.equal(card.sourceDetails.specifications.Material, 'Acetato');
  assert.equal(card.sourceDetails.rawData.custom, 'preservado');
});
