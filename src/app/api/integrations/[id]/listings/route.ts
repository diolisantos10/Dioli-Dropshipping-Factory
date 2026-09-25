import { publishProductToChannel } from '@/lib/channel-publishing';
import { CommandError } from '@/lib/commands';
import { forbidden, hasRole, requestActor, requestCorrelationId } from '@/lib/request-context';
export const runtime = 'nodejs';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!hasRole(request, ['ADMIN', 'APPROVER'])) return forbidden();
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({})) as { productId?: unknown };
    if (typeof body.productId !== 'string' || !body.productId.trim() || body.productId.length > 80) return Response.json({ error: 'Produto obrigatório.' }, { status: 400 });
    const listing = await publishProductToChannel(id, body.productId, requestActor(request, 'admin:channel'), requestCorrelationId(request));
    return Response.json({ listing }, { status: 201 });
  } catch (error) {
    const status = error instanceof CommandError ? error.status : 400;
    return Response.json({ error: error instanceof Error ? error.message : 'Não foi possível publicar.' }, { status });
  }
}
