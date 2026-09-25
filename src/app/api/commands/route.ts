import { runServerCommand } from '@/lib/command-runner';
import { CommandError } from '@/lib/commands';
import { requestActor, requestCorrelationId, requestRole } from '@/lib/request-context';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  const role = requestRole(request);
  if (!role || role === 'VIEWER') return Response.json({ error: 'Permissão insuficiente.' }, { status: 403 });
  const length = Number(request.headers.get('content-length') ?? 0);
  if (length > 512_000) return Response.json({ error: 'Payload excede o limite.' }, { status: 413 });
  let body: { type?: unknown; input?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: 'JSON inválido.' }, { status: 400 }); }
  if (typeof body.type !== 'string' || !body.input || typeof body.input !== 'object' || Array.isArray(body.input)) return Response.json({ error: 'Informe type e input.' }, { status: 400 });
  const correlationId = requestCorrelationId(request);
  try {
    const result = await runServerCommand(body.type, body.input as Record<string, unknown>, { actor: requestActor(request), role, correlationId });
    return Response.json({ ...result, correlationId });
  } catch (error) {
    if (error instanceof CommandError) return Response.json({ error: error.message, correlationId }, { status: error.status });
    return Response.json({ error: 'Persistência indisponível.', correlationId }, { status: 503 });
  }
}
