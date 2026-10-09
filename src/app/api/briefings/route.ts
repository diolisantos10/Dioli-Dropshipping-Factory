import { discoveryStatus, runBrandDiscovery, saveDiscoveryBrief } from '@/lib/brand-discovery';
import type { BrandBrief } from '@/lib/brand-discovery-rules';
import { forbidden, hasRole, requestActor } from '@/lib/request-context';
export const runtime = 'nodejs';
export const maxDuration = 300;
export async function GET(request: Request) {
  if (!hasRole(request, ['ADMIN', 'APPROVER', 'OPERATOR', 'VIEWER', 'SYSTEM'])) return forbidden();
  try { return Response.json(await discoveryStatus()); } catch { return Response.json({ error: 'Briefings indisponíveis.' }, { status: 503 }); }
}
export async function POST(request: Request) {
  if (!hasRole(request, ['ADMIN', 'APPROVER'])) return forbidden();
  try {
    const body = await request.json() as { action?: string; brief?: BrandBrief };
    if (body.action === 'run') return Response.json(await runBrandDiscovery(requestActor(request, 'admin:brand-discovery')));
    if (body.action !== 'save' || !body.brief) return Response.json({ error: 'Ação inválida.' }, { status: 400 });
    return Response.json({ brief: await saveDiscoveryBrief(body.brief, requestActor(request)) });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'Operação indisponível.' }, { status: 400 }); }
}
