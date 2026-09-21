import { listAuditEvents } from '@/lib/server-state';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get('limit') ?? 100);
  try {
    return Response.json({ events: await listAuditEvents(Number.isFinite(limit) ? limit : 100) });
  } catch {
    return Response.json({ error: 'Auditoria indisponível.' }, { status: 503 });
  }
}
