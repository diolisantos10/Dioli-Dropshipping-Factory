import { runServerCommand } from '@/lib/command-runner';
import { CommandError } from '@/lib/commands';
import { getSupplierAdapterForIntegration } from '@/lib/integrations';
import { forbidden, hasRole, requestActor, requestCorrelationId, requestRole } from '@/lib/request-context';
import { supplierCandidateInput } from '@/lib/supplier-product';
import type { IntakeState } from '@/lib/intake';
export const runtime = 'nodejs';

export async function POST(request: Request, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  if (!hasRole(request, ['ADMIN', 'APPROVER', 'OPERATOR'])) return forbidden();
  try {
    const { id, itemId } = await params;
    if (!/^\d{5,30}$/.test(itemId)) return Response.json({ error: 'Referência de produto inválida.' }, { status: 400 });
    const connection = await getSupplierAdapterForIntegration(id);
    if (!connection) return Response.json({ error: 'Fornecedor não encontrado.' }, { status: 404 });
    const product = await connection.adapter.getProduct(itemId);
    const input = supplierCandidateInput(product, connection.name);
    const result = await runServerCommand('intake.addCandidate', { ...input }, { actor: requestActor(request, 'admin:supplier-import'), role: requestRole(request), correlationId: requestCorrelationId(request) });
    const candidate = (result.payload as IntakeState).candidates.find((item) => item.url === input.url);
    return Response.json({ candidate, revision: result.revision }, { status: 201 });
  } catch (error) {
    const status = error instanceof CommandError ? error.status : 400;
    return Response.json({ error: error instanceof Error ? error.message : 'Não foi possível importar o produto.' }, { status });
  }
}
