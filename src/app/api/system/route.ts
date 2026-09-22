import { drainOutbox, operationalStatus, reprocessOutboxEvent } from '@/lib/server-state';

export const runtime = 'nodejs';
export async function GET() {
  try { return Response.json(await operationalStatus()); }
  catch { return Response.json({ error:'Status operacional indisponível.' },{status:503}); }
}
export async function POST(request: Request) {
  const role = request.headers.get('x-ddf-role') || (process.env.NODE_ENV === 'production' ? '' : 'ADMIN');
  if (role !== 'ADMIN') return Response.json({ error:'Permissão insuficiente.' },{status:403});
  try {
    const body=await request.json().catch(()=>({action:'drain'})) as {action?:string;eventId?:string;correlationId?:string};
    if(body.action==='reprocess') {
      if(!body.eventId) return Response.json({error:'eventId obrigatório.'},{status:400});
      const result=await reprocessOutboxEvent(body.eventId,'admin:operations',body.correlationId||crypto.randomUUID());
      return result?Response.json(result):Response.json({error:'Evento não encontrado ou não reprocessável.'},{status:409});
    }
    return Response.json(await drainOutbox(100));
  }
  catch { return Response.json({ error:'Não foi possível processar a outbox.' },{status:503}); }
}
