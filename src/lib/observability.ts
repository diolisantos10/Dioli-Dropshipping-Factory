export type QueueStatus = 'PENDING'|'PROCESSING'|'PUBLISHED'|'FAILED'|'DEAD';

export type QueueEvent = {
  id:string; topic:string; aggregateType:string; aggregateId:string;
  status:QueueStatus; attempts:number; availableAt:string; createdAt:string;
  publishedAt:string|null; lastError:string|null; correlationId:string|null;
};

export type OperationalSnapshot = {
  generatedAt:string;
  latencyMs:number;
  outbox:Record<string,number>;
  queue:QueueEvent[];
  audit:{count:number;latest:string|null};
  state:Array<{namespace:string;revision:number;updatedAt:string;stale:boolean}>;
};

export type OperationalAlert = { severity:'critical'|'warning'|'info'; code:string; message:string };

export function deriveOperationalAlerts(snapshot:OperationalSnapshot):OperationalAlert[]{
  const alerts:OperationalAlert[]=[];
  const dead=snapshot.outbox.DEAD??0, failed=snapshot.outbox.FAILED??0, processing=snapshot.outbox.PROCESSING??0;
  if(dead) alerts.push({severity:'critical',code:'DLQ_NOT_EMPTY',message:`${dead} evento(s) aguardando reprocessamento manual.`});
  if(failed) alerts.push({severity:'warning',code:'RETRY_PENDING',message:`${failed} evento(s) em retry com backoff exponencial.`});
  if(processing) alerts.push({severity:'info',code:'QUEUE_PROCESSING',message:`${processing} evento(s) em processamento.`});
  const stale=snapshot.state.filter(item=>item.stale);
  if(stale.length) alerts.push({severity:'warning',code:'STATE_STALE',message:`Estado desatualizado: ${stale.map(item=>item.namespace).join(', ')}.`});
  if(snapshot.latencyMs>750) alerts.push({severity:'warning',code:'HIGH_LATENCY',message:`Latência do banco elevada (${snapshot.latencyMs} ms).`});
  return alerts;
}

export function causalAudit<T extends {correlationId?:string|null}>(events:T[], correlationId:string|null){
  return correlationId ? events.filter(event=>event.correlationId===correlationId) : events;
}

export function queueCanBeReprocessed(event:Pick<QueueEvent,'status'>){
  return event.status==='DEAD'||event.status==='FAILED';
}
