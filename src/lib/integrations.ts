import { randomBytes, randomUUID } from 'node:crypto';
import { getDatabasePool } from './server-state';
import { getProviderAdapter } from './providers';
import { aliExpressCredentialsFrom, refreshAliExpressToken, tokenNeedsRefresh, type AliExpressToken } from './providers/aliexpress';
import { shopifyClientCredentialsToken } from './providers/shopify';
import type { ChannelAdapter, SupplierAdapter } from './providers/types';
import { decryptIntegrationSecrets, encryptIntegrationSecrets, integrationStatusForSecrets, serializePublicIntegration } from './integration-security';
export { decryptIntegrationSecrets, encryptIntegrationSecrets, integrationStatusForSecrets, serializePublicIntegration } from './integration-security';
import type { IntegrationStatus } from './integration-security';
export type { IntegrationStatus } from './integration-security';
export type IntegrationKind='SUPPLIER'|'CHANNEL'|'PROVIDER';
export type IntegrationInput={kind:IntegrationKind;providerKey:string;name:string;environment?:'SANDBOX'|'PRODUCTION';config?:Record<string,string>;secrets?:Record<string,string>;capabilities?:string[]};
type Row=Record<string,unknown>&{id:string;provider_key:string;config:Record<string,string>|null;encrypted_secrets:string|null;environment:string|null;status:string;name:string};
const MANUAL_STATUSES=new Set<IntegrationStatus>(['ACTIVE','DISABLED']);
const OAUTH_STATE_TTL_MINUTES=15;
export function validateIntegrationInput(input:Partial<IntegrationInput>){
 if(input.name!==undefined&&!input.name.trim())throw new Error('O nome da integração é obrigatório.');
 if(input.environment!==undefined&&!['SANDBOX','PRODUCTION'].includes(input.environment))throw new Error('Ambiente inválido.');
 for(const [field,value]of Object.entries(input.config??{}))if(typeof value!=='string'||value.length>2000)throw new Error(`Configuração inválida: ${field}.`);
 for(const [field,value]of Object.entries(input.secrets??{}))if(typeof value!=='string'||value.length>8000)throw new Error(`Credencial inválida: ${field}.`);
}
const encrypt=encryptIntegrationSecrets;
const decrypt=decryptIntegrationSecrets;
const publicRow=serializePublicIntegration;
export async function listIntegrations(){const db=await getDatabasePool();const [items,bindings,tests,listings]=await Promise.all([db.query('SELECT * FROM integration_configs ORDER BY updated_at DESC'),db.query(`SELECT id,brand_name AS "brandName",store_name AS "storeName",integration_id AS "integrationId",status,created_at AS "createdAt",updated_at AS "updatedAt" FROM brand_store_bindings ORDER BY updated_at DESC`),db.query(`SELECT id,integration_id AS "integrationId",status,message,checked_at AS "checkedAt" FROM integration_test_runs ORDER BY checked_at DESC LIMIT 50`),db.query(`SELECT id,integration_id AS "integrationId",product_id AS "productId",external_id AS "externalId",admin_url AS "adminUrl",status,price::float AS price,currency,published_at AS "publishedAt",updated_at AS "updatedAt" FROM channel_listings ORDER BY updated_at DESC LIMIT 200`)]);return{items:items.rows.map(publicRow),bindings:bindings.rows,tests:tests.rows,listings:listings.rows}}
export async function createIntegration(input:IntegrationInput,actor:string,correlationId:string){validateIntegrationInput(input);const db=await getDatabasePool();const id=randomUUID();const secrets=input.secrets??{};const fields=Object.keys(secrets).filter(k=>secrets[k]);const status=integrationStatusForSecrets(secrets);const result=await db.query(`INSERT INTO integration_configs(id,kind,provider_key,name,environment,status,config,encrypted_secrets,secret_fields,capabilities) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,[id,input.kind,input.providerKey,input.name,input.environment??'PRODUCTION',status,JSON.stringify(input.config??{}),fields.length?encrypt(secrets):null,JSON.stringify(fields),JSON.stringify(input.capabilities??[])]);await db.query(`INSERT INTO audit_events(id,actor,action,entity_type,entity_id,correlation_id,after_state,metadata) VALUES($1,$2,'INTEGRATION_CREATED','INTEGRATION',$3,$4,$5,$6)`,[randomUUID(),actor,id,correlationId,JSON.stringify(publicRow(result.rows[0])),JSON.stringify({secretFields:fields})]);return publicRow(result.rows[0])}
export async function updateIntegration(id:string,input:Partial<IntegrationInput>&{status?:IntegrationStatus},actor:string,correlationId:string){validateIntegrationInput(input);const db=await getDatabasePool();const current=await db.query('SELECT * FROM integration_configs WHERE id=$1',[id]);if(!current.rows[0])return null;const old=current.rows[0];if(input.status&&!MANUAL_STATUSES.has(input.status))throw new Error('A situação só pode ser alterada usando testar, ativar ou desativar.');if(input.status==='ACTIVE'&&(!['TESTED','DISABLED'].includes(old.status)||!old.last_tested_at||old.last_error))throw new Error('Teste esta configuração com sucesso antes de ativá-la.');const oldSecrets=decrypt(old.encrypted_secrets);const supplied=Object.fromEntries(Object.entries(input.secrets??{}).filter(([,v])=>v));const secrets={...oldSecrets,...supplied};const fields=Object.keys(secrets);const changesConnection=input.config!==undefined||input.secrets!==undefined||input.environment!==undefined||input.capabilities!==undefined;const status=changesConnection?integrationStatusForSecrets(secrets):(input.status??old.status);const result=await db.query(`UPDATE integration_configs SET name=$2,environment=$3,status=$4,config=$5,encrypted_secrets=$6,secret_fields=$7,capabilities=$8,last_tested_at=$9,last_error=$10,updated_at=now() WHERE id=$1 RETURNING *`,[id,input.name??old.name,input.environment??old.environment,status,JSON.stringify(input.config??old.config),fields.length?encrypt(secrets):null,JSON.stringify(fields),JSON.stringify(input.capabilities??old.capabilities),changesConnection?null:old.last_tested_at,changesConnection?'Configuração alterada; execute um novo teste.':old.last_error]);await db.query(`INSERT INTO audit_events(id,actor,action,entity_type,entity_id,correlation_id,before_state,after_state) VALUES($1,$2,'INTEGRATION_UPDATED','INTEGRATION',$3,$4,$5,$6)`,[randomUUID(),actor,id,correlationId,JSON.stringify(publicRow(old)),JSON.stringify(publicRow(result.rows[0]))]);return publicRow(result.rows[0])}

async function loadRow(id:string):Promise<Row|null>{const db=await getDatabasePool();const result=await db.query('SELECT * FROM integration_configs WHERE id=$1',[id]);return(result.rows[0]as Row|undefined)??null}

// Persists new credentials obtained by OAuth, token refresh or client credentials. Secrets are merged
// into the encrypted vault, never returned to the browser, and every change is audited.
export async function storeIntegrationCredentials(id:string,patch:{secrets:Record<string,string>;config?:Record<string,string>;expiresAt?:string|null;account?:string|null;resetStatus?:boolean},actor:string,correlationId:string,action='INTEGRATION_CREDENTIALS_STORED'){
 const db=await getDatabasePool();const client=await db.connect();
 try{
  await client.query('BEGIN');
  const current=await client.query('SELECT * FROM integration_configs WHERE id=$1 FOR UPDATE',[id]);const old=current.rows[0];if(!old){await client.query('ROLLBACK');return null}
  const secrets={...decrypt(old.encrypted_secrets),...Object.fromEntries(Object.entries(patch.secrets).filter(([,value])=>value))};const fields=Object.keys(secrets);
  const config={...(old.config??{}),...(patch.config??{})};
  const status=patch.resetStatus?integrationStatusForSecrets(secrets):old.status;
  const result=await client.query(`UPDATE integration_configs SET config=$2,encrypted_secrets=$3,secret_fields=$4,status=$5,credential_expires_at=$6,connected_account=COALESCE($7,connected_account),last_error=CASE WHEN $8 THEN 'Credenciais renovadas; execute um novo teste.' ELSE last_error END,last_tested_at=CASE WHEN $8 THEN NULL ELSE last_tested_at END,updated_at=now() WHERE id=$1 RETURNING *`,[id,JSON.stringify(config),encrypt(secrets),JSON.stringify(fields),status,patch.expiresAt||null,patch.account??null,Boolean(patch.resetStatus)]);
  await client.query(`INSERT INTO audit_events(id,actor,action,entity_type,entity_id,correlation_id,before_state,after_state,metadata) VALUES($1,$2,$3,'INTEGRATION',$4,$5,$6,$7,$8)`,[randomUUID(),actor,action,id,correlationId,JSON.stringify(publicRow(old)),JSON.stringify(publicRow(result.rows[0])),JSON.stringify({secretFields:Object.keys(patch.secrets),expiresAt:patch.expiresAt??null})]);
  await client.query('COMMIT');return publicRow(result.rows[0]);
 }catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
}

export function aliExpressTokenSecrets(token:AliExpressToken){return{accessToken:token.accessToken,refreshToken:token.refreshToken,refreshExpiresAt:token.refreshExpiresAt}}

// Returns usable secrets, refreshing short-lived tokens first (AliExpress refresh token, Shopify client credentials).
export async function resolveIntegrationSecrets(row:Row,actor='system:credentials'):Promise<Record<string,string>>{
 const secrets=decrypt(row.encrypted_secrets);const config=row.config??{};
 const expiresAt=row.credential_expires_at?new Date(String(row.credential_expires_at)).toISOString():undefined;
 if(row.provider_key==='aliexpress'&&secrets.refreshToken&&tokenNeedsRefresh(expiresAt,Date.now(),60*60*1000)){
  const token=await refreshAliExpressToken(aliExpressCredentialsFrom(config,secrets),secrets.refreshToken);
  await storeIntegrationCredentials(row.id,{secrets:aliExpressTokenSecrets(token),expiresAt:token.expiresAt,account:token.account||null},actor,randomUUID(),'INTEGRATION_TOKEN_REFRESHED');
  return{...secrets,...aliExpressTokenSecrets(token)};
 }
 if(row.provider_key==='shopify'&&config.authMode==='client_credentials'&&(!secrets.accessToken||tokenNeedsRefresh(expiresAt,Date.now(),30*60*1000))){
  const clientId=config.clientId||process.env.SHOPIFY_CLIENT_ID||'';const clientSecret=secrets.clientSecret||process.env.SHOPIFY_CLIENT_SECRET||'';
  if(!clientId||!clientSecret)throw new Error('Client ID e Client Secret da Shopify são obrigatórios para client credentials.');
  const token=await shopifyClientCredentialsToken(config.storeDomain??'',clientId,clientSecret);
  await storeIntegrationCredentials(row.id,{secrets:{accessToken:token.accessToken},expiresAt:token.expiresAt},actor,randomUUID(),'INTEGRATION_TOKEN_REFRESHED');
  return{...secrets,accessToken:token.accessToken};
 }
 return secrets;
}

export async function testIntegration(id:string){const db=await getDatabasePool();const row=await loadRow(id);if(!row)return null;let success=true;let message='Configuração e credenciais disponíveis para o adaptador.';try{const secrets=await resolveIntegrationSecrets(row);const adapter=getProviderAdapter(row.provider_key,row.config??{},secrets,row.environment??'SANDBOX');if(adapter){const r=await adapter.test();success=r.ok;message=r.message;}else{if(!Object.keys(secrets).length){success=false;message='Inclua ao menos uma credencial antes de testar.'}}}catch(error){success=false;message=error instanceof Error&&!/DDF_CREDENTIALS_KEY|decrypt|auth tag/i.test(error.message)?`Falha ao preparar credenciais: ${error.message}`:'Não foi possível abrir o cofre de credenciais.'}const status=success?'TESTED':'ERROR';const runId=randomUUID();await db.query(`INSERT INTO integration_test_runs(id,integration_id,status,message) VALUES($1,$2,$3,$4)`,[runId,id,success?'SUCCEEDED':'FAILED',message]);await db.query(`UPDATE integration_configs SET status=CASE WHEN $4 AND status='ACTIVE' THEN 'ACTIVE' ELSE $2 END,last_tested_at=now(),last_error=$3,updated_at=now() WHERE id=$1`,[id,status,success?'':message,success]);return{success,message,status,runId}}
export async function createBinding(input:{brandName:string;storeName:string;integrationId?:string|null}){const db=await getDatabasePool();const result=await db.query(`INSERT INTO brand_store_bindings(id,brand_name,store_name,integration_id,status) VALUES($1,$2,$3,$4,'INACTIVE') RETURNING id,brand_name AS "brandName",store_name AS "storeName",integration_id AS "integrationId",status`,[randomUUID(),input.brandName,input.storeName,input.integrationId||null]);return result.rows[0]}

export async function getSupplierAdapterForIntegration(id:string):Promise<{adapter:SupplierAdapter;name:string;providerKey:string}|null>{
 const db=await getDatabasePool();
 const result=await db.query("SELECT * FROM integration_configs WHERE id=$1 AND kind='SUPPLIER'",[id]);
 const row=result.rows[0] as Row|undefined; if(!row)return null;
 if(!['TESTED','ACTIVE'].includes(row.status))throw new Error('Teste a integração do fornecedor antes de consultar produtos.');
 const adapter=getProviderAdapter(row.provider_key,row.config??{},await resolveIntegrationSecrets(row),row.environment??'PRODUCTION');
 if(!adapter||!('searchProducts' in adapter))throw new Error('Este fornecedor ainda não oferece consulta de produtos.');
 return{adapter:adapter as SupplierAdapter,name:String(row.name),providerKey:row.provider_key};
}

// Channel writes (publication) require an explicitly ACTIVATED connection; reads accept TESTED.
export async function getChannelAdapterForIntegration(id:string,purpose:'write'|'read'):Promise<{adapter:ChannelAdapter;name:string;row:Row}|null>{
 const row=await loadRow(id);if(!row||row.kind!=='CHANNEL')return null;
 const allowed=purpose==='write'?['ACTIVE']:['TESTED','ACTIVE'];
 if(!allowed.includes(row.status))throw new Error(purpose==='write'?'Ative a integração do canal antes de publicar.':'Teste a integração do canal antes de consultá-la.');
 const adapter=getProviderAdapter(row.provider_key,row.config??{},await resolveIntegrationSecrets(row),row.environment??'PRODUCTION');
 if(!adapter||!('upsertListing' in adapter))throw new Error('Este canal ainda não oferece publicação.');
 return{adapter:adapter as ChannelAdapter,name:String(row.name),row};
}

export async function createOAuthState(providerKey:string,integrationId:string,actor:string,shop:string|null=null){
 const db=await getDatabasePool();const state=randomBytes(24).toString('base64url');
 await db.query(`DELETE FROM oauth_states WHERE expires_at < now() - interval '1 day'`);
 await db.query(`INSERT INTO oauth_states(state,provider_key,integration_id,shop,actor,expires_at) VALUES($1,$2,$3,$4,$5,now()+make_interval(mins => $6))`,[state,providerKey,integrationId,shop,actor.slice(0,160),OAUTH_STATE_TTL_MINUTES]);
 return state;
}

// Single-use: the row is marked as used atomically, so a replayed callback is rejected.
export async function consumeOAuthState(state:string,providerKey:string){
 if(!/^[\w-]{20,80}$/.test(state))return null;
 const db=await getDatabasePool();
 const result=await db.query(`UPDATE oauth_states SET used_at=now() WHERE state=$1 AND provider_key=$2 AND used_at IS NULL AND expires_at > now() RETURNING integration_id AS "integrationId",shop,actor`,[state,providerKey]);
 return(result.rows[0]as{integrationId:string;shop:string|null;actor:string}|undefined)??null;
}

export async function findOrCreateProviderIntegration(input:IntegrationInput,integrationId:string|null,actor:string,correlationId:string){
 if(integrationId){const row=await loadRow(integrationId);if(!row||row.provider_key!==input.providerKey)throw new Error('Integração não encontrada para este provedor.');return row.id}
 const created=await createIntegration(input,actor,correlationId);return String(created.id);
}

export async function refreshExpiringCredentials(actor='system:automation'){
 const db=await getDatabasePool();
 const result=await db.query(`SELECT * FROM integration_configs WHERE status NOT IN ('DISABLED','DRAFT') AND provider_key IN ('aliexpress','shopify') AND credential_expires_at IS NOT NULL AND credential_expires_at < now() + interval '24 hours'`);
 const outcome={checked:result.rowCount??0,refreshed:0,failed:[] as string[]};
 for(const row of result.rows as Row[]){
  try{
   const secrets=decrypt(row.encrypted_secrets);
   if(row.provider_key==='aliexpress'&&secrets.refreshToken){const token=await refreshAliExpressToken(aliExpressCredentialsFrom(row.config??{},secrets),secrets.refreshToken);await storeIntegrationCredentials(row.id,{secrets:aliExpressTokenSecrets(token),expiresAt:token.expiresAt,account:token.account||null},actor,randomUUID(),'INTEGRATION_TOKEN_REFRESHED');outcome.refreshed+=1}
   else if(row.provider_key==='shopify'&&(row.config??{}).authMode==='client_credentials'){await resolveIntegrationSecrets({...row,credential_expires_at:new Date(0).toISOString()},actor);outcome.refreshed+=1}
  }catch(error){const message=error instanceof Error?error.message:'falha desconhecida';outcome.failed.push(`${row.name}: ${message}`);await db.query(`UPDATE integration_configs SET last_error=$2,updated_at=now() WHERE id=$1`,[row.id,`Renovação automática falhou: ${message}`.slice(0,500)])}
 }
 return outcome;
}
