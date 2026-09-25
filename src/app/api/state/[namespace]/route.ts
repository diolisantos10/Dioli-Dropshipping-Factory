import { isStateNamespace, readState } from '@/lib/server-state';
export const runtime = 'nodejs';
export async function GET(_: Request, { params }: { params: Promise<{ namespace: string }> }) {
  const { namespace } = await params; if (!isStateNamespace(namespace)) return Response.json({ error: 'Namespace inválido.' }, { status: 404 });
  try { const row = await readState(namespace); return Response.json(row ? { payload: row.payload, revision: Number(row.revision), updatedAt: row.updated_at } : { payload: null, revision: null }); }
  catch { return Response.json({ error: 'Persistência indisponível.' }, { status: 503 }); }
}
// Raw state writes are closed: business rules run on the server through POST /api/commands.
export async function PUT() {
  return Response.json({ error: 'Gravação direta de estado desativada. Use /api/commands.' }, { status: 405, headers: { Allow: 'GET' } });
}
