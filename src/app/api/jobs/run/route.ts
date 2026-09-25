import { automationTasks, recentAutomationRuns, runAutomation, type AutomationTask } from '@/lib/automation';
import { forbidden, hasRole, requestActor, requestRole } from '@/lib/request-context';
export const runtime = 'nodejs';
export const maxDuration = 300;

// Called by the Railway cron service (Bearer DDF_CRON_TOKEN, validated in src/proxy.ts → role SYSTEM)
// or manually by an ADMIN from the Control Room.
export async function POST(request: Request) {
  if (!hasRole(request, ['SYSTEM', 'ADMIN'])) return forbidden();
  const body = await request.json().catch(() => ({})) as { tasks?: unknown };
  const tasks = Array.isArray(body.tasks) ? body.tasks.filter((task): task is AutomationTask => automationTasks.includes(task as AutomationTask)) : automationTasks;
  if (!tasks.length) return Response.json({ error: 'Nenhuma tarefa válida.' }, { status: 400 });
  try {
    const system = requestRole(request) === 'SYSTEM';
    const result = await runAutomation(system ? 'cron' : 'manual', system ? 'system:cron' : requestActor(request), tasks);
    return Response.json(result, { status: result.status === 'SKIPPED' ? 409 : result.status === 'FAILED' ? 500 : 200 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Automação indisponível.' }, { status: 503 });
  }
}

export async function GET(request: Request) {
  if (!hasRole(request, ['SYSTEM', 'ADMIN', 'APPROVER', 'OPERATOR', 'VIEWER'])) return forbidden();
  try { return Response.json({ runs: await recentAutomationRuns(20) }); }
  catch { return Response.json({ error: 'Automação indisponível.' }, { status: 503 }); }
}
