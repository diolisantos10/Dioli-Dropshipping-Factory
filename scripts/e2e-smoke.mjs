import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const port='3100';const base=`http://127.0.0.1:${port}`;const auth=`Basic ${Buffer.from('e2e:strong-test-password').toString('base64')}`;
const child=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p',port],{env:{...process.env,DDF_ADMIN_USER:'e2e',DDF_ADMIN_PASSWORD:'strong-test-password',DDF_ADMIN_ROLE:'ADMIN'},stdio:['ignore','pipe','pipe']});
let logs='';child.stdout.on('data',chunk=>logs+=chunk);child.stderr.on('data',chunk=>logs+=chunk);
async function wait(){for(let attempt=0;attempt<40;attempt+=1){try{const response=await fetch(`${base}/visao-geral`,{headers:{authorization:auth}});if(response.ok)return}catch{}await new Promise(resolve=>setTimeout(resolve,250))}throw new Error(`Servidor não iniciou. ${logs}`)}
try{
 await wait();
 const denied=await fetch(`${base}/visao-geral`,{redirect:'manual'});assert.equal(denied.status,401);assert.equal(denied.headers.get('x-frame-options'),'DENY');
 for(const route of ['/visao-geral','/prateleira-bruta','/triagem','/product-factory','/media-factory','/disponiveis','/pricing','/integracoes','/pedidos','/inteligencia','/auditoria']){const response=await fetch(`${base}${route}`,{headers:{authorization:auth}});assert.equal(response.status,200,route);const html=await response.text();assert.match(html,/<main\b/i,`${route} sem landmark main`);assert.match(html,/<h1\b/i,`${route} sem h1`)}
 const invalid=await fetch(`${base}/api/state/invalido`,{headers:{authorization:auth}});assert.equal(invalid.status,404);
 const rawWrite=await fetch(`${base}/api/state/intake`,{method:'PUT',headers:{authorization:auth,'content-type':'application/json'},body:JSON.stringify({payload:{},revision:null})});assert.equal(rawWrite.status,405,'gravação direta de estado deve estar fechada');
 const badCron=await fetch(`${base}/api/jobs/run`,{method:'POST',headers:{authorization:'Bearer token-invalido-com-mais-de-trinta-e-dois-caracteres'}});assert.equal(badCron.status,401,'cron exige token válido');
 const unknown=await fetch(`${base}/api/commands`,{method:'POST',headers:{authorization:auth,'content-type':'application/json'},body:JSON.stringify({type:'nao.existe',input:{}})});assert.equal(unknown.status,404,'comando desconhecido');
 const noAuthCommand=await fetch(`${base}/api/commands`,{method:'POST',headers:{'content-type':'application/json'},body:'{}'});assert.equal(noAuthCommand.status,401);
 console.log('E2E smoke: autenticação, 11 rotas, landmarks, API, comandos e cron validados.');
}finally{child.kill('SIGTERM')}
