export type ConnectorKind = 'SUPPLIER'|'CHANNEL';
export type ConnectorHealth = 'HEALTHY'|'DEGRADED'|'OFFLINE';
export type Connector = { id:string; name:string; kind:ConnectorKind; simulated:true; capabilities:string[]; health:ConnectorHealth; lastSyncAt:string|null; error:string; attempts?:number; staleAfter?:string|null };
export type ConnectorState = { version:1; connectors:Connector[]; processedKeys:string[] };
export const CONNECTOR_STORAGE_KEY='ddf.connectors.demo.v1';
export const emptyConnectors:ConnectorState={version:1,connectors:[
 {id:'supplier-simulator',name:'Supplier Adapter Simulado',kind:'SUPPLIER',simulated:true,capabilities:['catalog.read','cost.read','inventory.read','tracking.read'],health:'HEALTHY',lastSyncAt:null,error:''},
 {id:'channel-simulator',name:'Channel Adapter Simulado',kind:'CHANNEL',simulated:true,capabilities:['listing.write','price.write','order.read','tracking.write'],health:'HEALTHY',lastSyncAt:null,error:''}
],processedKeys:[]};
export function simulateSync(state:ConnectorState,id:string,key:string,at:string,fail=false):ConnectorState{
 if(!key.trim())throw new Error('Idempotency key obrigatória.');
 if(state.processedKeys.includes(key))return state;
 if(!state.connectors.some(c=>c.id===id))throw new Error('Connector não encontrado.');
 const timestamp=new Date(at).getTime();const staleAfter=Number.isFinite(timestamp)?new Date(timestamp+15*60_000).toISOString():null;
 return {...state,processedKeys:[key,...state.processedKeys],connectors:state.connectors.map(c=>c.id===id?{...c,health:fail?'DEGRADED':'HEALTHY',lastSyncAt:at,error:fail?'Falha simulada isolada; retry disponível.':'',attempts:(c.attempts??0)+1,staleAfter}:c)};
}
export function isConnectorStale(connector:Connector,now:string){return !connector.staleAfter||connector.staleAfter<now}
