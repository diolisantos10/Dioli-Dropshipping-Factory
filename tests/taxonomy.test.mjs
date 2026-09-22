import test from'node:test';import assert from'node:assert/strict';import{baseTaxonomy,taxonomyGaps}from'../src/lib/taxonomy.ts';
test('taxonomia é hierárquica e extensível',()=>{assert.ok(baseTaxonomy.some(node=>node.parentId));assert.deepEqual(taxonomyGaps('Moda > Acessórios',{material:'Resina'}),['cor']);assert.deepEqual(taxonomyGaps('categoria externa',{}),[])});
