import assert from 'node:assert/strict';
const base=(process.env.DDF_SMOKE_URL||'').replace(/\/$/,'');
if(!base)throw new Error('Defina DDF_SMOKE_URL.');
const headers={};if(process.env.DDF_SMOKE_USER&&process.env.DDF_SMOKE_PASSWORD)headers.authorization=`Basic ${Buffer.from(`${process.env.DDF_SMOKE_USER}:${process.env.DDF_SMOKE_PASSWORD}`).toString('base64')}`;
const health=await fetch(`${base}/health`);assert.equal(health.status,200,'health indisponível');const body=await health.json();assert.equal(body.status,'ok');
const app=await fetch(`${base}/visao-geral`,{headers,redirect:'manual'});assert.equal(app.status,200,'rota protegida indisponível');assert.ok(app.headers.get('x-correlation-id'));
console.log(`Smoke de produção aprovado: ${base}`);
