// Railway cron entrypoint: triggers one automation run on the DDF Control Room and exits.
// Required env: DDF_APP_URL (public HTTPS URL of the Control Room) and DDF_CRON_TOKEN (>= 32 chars).
const base = process.env.DDF_APP_URL?.replace(/\/+$/, '');
const token = process.env.DDF_CRON_TOKEN;
if (!base || !token) {
  console.error('DDF_APP_URL e DDF_CRON_TOKEN são obrigatórios.');
  process.exit(2);
}
const tasks = process.env.DDF_CRON_TASKS?.split(',').map((task) => task.trim()).filter(Boolean);
const started = Date.now();
try {
  const response = await fetch(`${base}/api/jobs/run`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(tasks?.length ? { tasks } : {}),
    signal: AbortSignal.timeout(290_000),
  });
  const body = await response.json().catch(() => ({}));
  const summary = (body.results ?? []).map((item) => `${item.task}=${item.status}${item.error ? ` (${item.error})` : ''}`).join(' | ');
  console.log(`[ddf-cron] HTTP ${response.status} · ${body.status ?? body.error ?? 'sem corpo'} · ${Date.now() - started} ms${summary ? ` · ${summary}` : ''}`);
  // 409 = another run in progress: not a failure of this invocation.
  process.exit(response.ok || response.status === 409 ? 0 : 1);
} catch (error) {
  console.error(`[ddf-cron] falha: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
}
