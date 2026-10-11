import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { inspectSupplierPage } from '../src/lib/providers/supplier-page.ts';

// Rendered-browser contract test; no supplier network, paid gateway or media generation.
const browser = await chromium.launch({ executablePath: process.env.DDF_CHROMIUM_EXECUTABLE_PATH || undefined, headless: true });
try {
  for (const label of ['Ficha ampliada 2027', 'Composição e geometria']) {
    const page = await browser.newPage();
    await page.route('**/*', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: `<h1>SE69170</h1><button onclick="document.getElementById('panel').hidden=false">${label}</button><div id="panel" hidden><p>Lens width: 57 mm</p><p>Lens height: 32 mm</p><img src="https://vendor.example/spec.png" alt="SE69170 component diagram" width="100" height="100"></div><article><a href="/goods/other">Other glasses</a><p>Lens width: 99 mm</p></article>` }));
    let calls = 0;
    const result = await inspectSupplierPage(page, { itemId: 'pilot', url: 'https://vendor.example/goods/pilot', title: 'SE69170' }, { provider: 'fixture', allowedHosts: ['vendor.example'], productPathPattern: '^/goods/([^/]+)$' }, async request => {
      const { observation } = JSON.parse(request.prompt);
      assert.ok(request.referenceImages[0].startsWith('data:image/png;base64,'));
      assert.ok(observation.blocks.some(block => block.foreignProduct && block.text.includes('99 mm')));
      const blocks = observation.blocks.filter(block => !block.foreignProduct && (/57 mm|32 mm/.test(block.text) || block.images.length));
      const control = observation.controls.find(control => control.label === label);
      assert.ok(control, JSON.stringify(observation.controls));
      calls++;
      return { text: JSON.stringify({ action: calls === 1 ? 'click' : 'finish', controlId: control.id, relevantBlockIds: blocks.map(block => block.id), reason: 'Read current product panel' }) };
    });
    assert.equal(calls, 2);
    assert.equal(result.specifications['Largura da lente'], '57 mm');
    assert.equal(result.specifications['Altura da lente'], '32 mm');
    assert.ok(result.images.includes('https://vendor.example/spec.png'));
    assert.ok(!result.description.includes('99 mm'));
    await page.close();
  }
  console.info('Rendered supplier exploration: renamed menus, generic access adapter, image-only evidence and recommendation isolation passed.');
} finally { await browser.close(); }
