import { databaseHealth } from '@/lib/server-state';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const database = await databaseHealth();
    return Response.json({ status: 'ok', service: 'ddf', database, checkedAt: new Date().toISOString() });
  } catch {
    return Response.json({ status: 'degraded', service: 'ddf', database: { status: 'down' }, checkedAt: new Date().toISOString() }, { status: 503 });
  }
}
