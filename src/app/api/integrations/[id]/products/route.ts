import { getSupplierAdapterForIntegration } from '@/lib/integrations';
import { forbidden, hasRole } from '@/lib/request-context';
import { validateSupplierSearch } from '@/lib/supplier-product';
export const runtime = 'nodejs';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!hasRole(request, ['ADMIN', 'APPROVER', 'OPERATOR'])) return forbidden();
  try {
    const { id } = await params;
    const url = new URL(request.url);
    const pageSize = Number(url.searchParams.get('pageSize') ?? 20);
    const page = Math.min(100, Math.max(1, Math.trunc(Number(url.searchParams.get('page') ?? 1)) || 1));
    const query = validateSupplierSearch(url.searchParams.get('q') ?? '', pageSize);
    const connection = await getSupplierAdapterForIntegration(id);
    if (!connection) return Response.json({ error: 'Fornecedor não encontrado.' }, { status: 404 });
    const products = await connection.adapter.searchProducts(query, { page, pageSize });
    return Response.json({ products, page, supplierName: connection.name });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Não foi possível consultar o fornecedor.' }, { status: 400 });
  }
}
