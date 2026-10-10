import { pathToFileURL } from 'node:url';

const MAX_RUNS = 12;
const MAX_OVERLAP_CHECKS = 12;
const MAX_WALL_MS = 600_000;
const safeCode = value => typeof value === 'string' ? value.replace(/[^a-z0-9_]/g, '').slice(0, 120) : '';
const count = value => Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : 0;

/** Only aggregate operational metrics leave the normal authenticated automation endpoint. */
export function pilotProgress(body) {
  const task = Array.isArray(body?.results) ? body.results.find(item => item.task === 'factoryPilot') : undefined;
  const detail = task?.detail ?? {};
  const studioResults = Array.isArray(detail.studio?.results) ? detail.studio.results : [];
  const code = safeCode(detail.code || studioResults.find(item => item.code)?.code);
  const stage = typeof detail.stage === 'string' ? detail.stage.replace(/[^A-Z_]/g, '').slice(0, 40) : 'UNKNOWN';
  return { stage, sourceCount: count(detail.sourceCount), sourceRead: count(detail.sourceRead), approvedPhotos: count(detail.approvedPhotos),
    gapCount: count(detail.gapCount), inspected: studioResults.reduce((sum, item) => sum + count(item.inspected), 0),
    ready: count(detail.ready), failed: task?.status === 'FAILED' || count(detail.failed) > 0 || count(detail.studio?.failed) > 0,
    blocked: task?.status === 'BLOCKED' || count(detail.blocked) > 0 || count(detail.studio?.blocked) > 0,
    ...(code ? { code } : {}), present: !!task };
}

export function decidePilotProgress(current, previous) {
  if (!current.present) return 'missing_result';
  if (current.failed || current.blocked || current.code) return 'requires_review';
  if (current.ready >= 1) return 'ready';
  if (current.approvedPhotos >= 4) return 'four_photos';
  if (!previous) return current.sourceRead > 0 || current.inspected > 0 || current.approvedPhotos > 0 ? 'continue' : 'no_progress';
  return current.sourceRead > previous.sourceRead || current.approvedPhotos > previous.approvedPhotos || current.inspected > previous.inspected ? 'continue' : 'no_progress';
}

/** Explicit one-off pilot: normal backend commands, one product, bounded progress, never retry a failed paid call. */
export async function runPilot({ fetchImpl = fetch, now = Date.now, wait = ms => new Promise(resolve => setTimeout(resolve, ms)),
  log = console.log, baseUrl = process.env.DDF_APP_URL, token = process.env.DDF_CRON_TOKEN } = {}) {
  let base;
  try { base = new URL(baseUrl); } catch { log('[ddf-pilot] stop=configuration_missing'); return { reason: 'configuration_missing', calls: 0 }; }
  if (base.protocol !== 'https:' || base.username || base.password || !token || token.length < 32) {
    log('[ddf-pilot] stop=configuration_invalid'); return { reason: 'configuration_invalid', calls: 0 };
  }
  const endpoint = new URL('/api/jobs/run', base).href;
  const started = now();
  let calls = 0, overlapChecks = 0, previous;
  while (calls < MAX_RUNS && now() - started < MAX_WALL_MS) {
    let response, body;
    try {
      response = await fetchImpl(endpoint, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ tasks: ['factoryPilot'] }), signal: AbortSignal.timeout(Math.max(1, Math.min(600_000, MAX_WALL_MS - (now() - started)))) });
      if (response.status === 409) {
        if (++overlapChecks >= MAX_OVERLAP_CHECKS || now() - started + 5_000 >= MAX_WALL_MS) {
          log('[ddf-pilot] stop=automation_busy'); return { reason: 'automation_busy', calls };
        }
        await wait(5_000); continue;
      }
      if (!response.ok) { log(`[ddf-pilot] stop=http_error status=${count(response.status)}`); return { reason: 'http_error', calls }; }
      body = await response.json();
    } catch {
      // Do not log fetch errors: some clients include request URLs, headers or response data.
      log('[ddf-pilot] stop=request_failed'); return { reason: 'request_failed', calls };
    }
    calls++;
    const current = pilotProgress(body);
    const decision = decidePilotProgress(current, previous);
    log(`[ddf-pilot] run=${calls} stage=${current.stage} source=${current.sourceRead}/${current.sourceCount} inspected=${current.inspected} approved=${current.approvedPhotos} gaps=${current.gapCount}${current.code ? ` code=${current.code}` : ''} action=${decision}`);
    if (decision !== 'continue') return { reason: decision, calls, progress: current };
    previous = current;
  }
  const reason = calls >= MAX_RUNS ? 'invocation_limit' : 'time_limit';
  log(`[ddf-pilot] stop=${reason} runs=${calls}`);
  return { reason, calls, progress: previous };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await runPilot();
  process.exitCode = ['ready', 'four_photos', 'invocation_limit', 'time_limit'].includes(result.reason) ? 0 : 1;
}
