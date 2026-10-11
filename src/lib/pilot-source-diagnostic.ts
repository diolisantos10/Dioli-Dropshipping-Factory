/** Retain useful exceptions without emitting credentials, signed URL queries or model output. */
export function sourceDiagnostic(error: unknown, sourceUrls: string[], step: string, secrets: string[] = []) {
  const cleanUrl = (raw: string) => {
    try { const url = new URL(raw); url.username = ''; url.password = ''; url.search = ''; url.hash = ''; return url.href; }
    catch { return '[invalid URL]'; }
  };
  const redact = (raw: string) => {
    let result = raw;
    for (const secret of secrets.filter(value => value.length >= 8)) result = result.split(secret).join('[redacted]');
    return result.replace(/https?:\/\/[^\s"'<>]+/g, cleanUrl)
      .replace(/\b(?:Bearer\s+\S+|sk-[A-Za-z0-9_-]+)\b/gi, '[redacted]').slice(0, 8000);
  };
  return { step, message: redact(error instanceof Error ? error.message : 'Non-Error exception'),
    stack: redact(error instanceof Error ? error.stack ?? '' : ''), sourceUrls: sourceUrls.map(cleanUrl) };
}
