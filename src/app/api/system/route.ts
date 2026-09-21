import { drainOutbox, operationalStatus } from '@/lib/server-state';

export const runtime = 'nodejs';
export async function GET() {
  try { return Response.json(await operationalStatus()); }
  catch { return Response.json({ error:'Status operacional indisponível.' },{status:503}); }
}
export async function POST(request: Request) {
  const role = request.headers.get('x-ddf-role') || (process.env.NODE_ENV === 'production' ? '' : 'ADMIN');
  if (role !== 'ADMIN') return Response.json({ error:'Permissão insuficiente.' },{status:403});
  try { return Response.json(await drainOutbox(100)); }
  catch { return Response.json({ error:'Não foi possível processar a outbox.' },{status:503}); }
}
