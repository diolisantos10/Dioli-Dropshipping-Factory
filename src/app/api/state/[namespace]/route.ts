import { isStateNamespace, readState, writeState } from '@/lib/server-state';
export const runtime = 'nodejs';
export async function GET(_: Request, { params }: { params: Promise<{ namespace: string }> }) {
  const { namespace } = await params; if (!isStateNamespace(namespace)) return Response.json({ error: 'Namespace inválido.' }, { status: 404 });
  try { const row = await readState(namespace); return Response.json(row ? { payload: row.payload, revision: Number(row.revision), updatedAt: row.updated_at } : { payload: null, revision: null }); }
  catch { return Response.json({ error: 'Persistência indisponível.' }, { status: 503 }); }
}
export async function PUT(request: Request, { params }: { params: Promise<{ namespace: string }> }) {
  const { namespace } = await params; if (!isStateNamespace(namespace)) return Response.json({ error: 'Namespace inválido.' }, { status: 404 });
  const length = Number(request.headers.get('content-length') ?? 0); if (length > 2_000_000) return Response.json({ error: 'Payload excede o limite.' }, { status: 413 });
  try { const body = await request.json(); if (!body || typeof body !== 'object' || !('payload' in body)) return Response.json({ error: 'Payload inválido.' }, { status: 400 });
    const expected = typeof body.revision === 'number' ? body.revision : null; const row = await writeState(namespace, body.payload, expected);
    if (!row) return Response.json({ error: 'Conflito de versão. Recarregue os dados.' }, { status: 409 });
    return Response.json({ payload: row.payload, revision: Number(row.revision), updatedAt: row.updated_at });
  } catch { return Response.json({ error: 'Não foi possível persistir.' }, { status: 503 }); }
}
