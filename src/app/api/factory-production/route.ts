import { factoryProductionStatus } from '@/lib/factory-production';
import { forbidden, hasRole } from '@/lib/request-context';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  if (!hasRole(request, ['ADMIN', 'APPROVER', 'OPERATOR', 'VIEWER'])) return forbidden();
  try { return Response.json(await factoryProductionStatus()); }
  catch { return Response.json({ error: 'Não foi possível consultar a esteira automática.' }, { status: 503 }); }
}
