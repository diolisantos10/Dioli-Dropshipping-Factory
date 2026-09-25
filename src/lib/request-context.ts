import { randomUUID } from 'node:crypto';

export type DdfRole = 'ADMIN' | 'APPROVER' | 'OPERATOR' | 'VIEWER' | 'SYSTEM';

// Identity headers are set by src/proxy.ts after authentication and cannot be supplied by the
// client (the proxy overwrites them). Outside production, missing headers mean a local ADMIN.
export function requestRole(request: Request): string {
  return request.headers.get('x-ddf-role') || (process.env.NODE_ENV === 'production' ? '' : 'ADMIN');
}
export function hasRole(request: Request, roles: DdfRole[]) { return (roles as string[]).includes(requestRole(request)); }
export function requestActor(request: Request, fallback = 'DDF administrator') { return request.headers.get('x-ddf-actor')?.slice(0, 160) || fallback; }
export function requestCorrelationId(request: Request) {
  const supplied = request.headers.get('x-correlation-id');
  return supplied && /^[0-9a-f-]{36}$/i.test(supplied) ? supplied : randomUUID();
}
export function forbidden() { return Response.json({ error: 'Permissão insuficiente.' }, { status: 403 }); }

// OAuth redirect URIs must be the public HTTPS origin registered in the provider consoles.
export function publicBaseUrl(request: Request) {
  const configured = process.env.DDF_PUBLIC_URL?.trim().replace(/\/+$/, '');
  if (configured) return configured;
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  const proto = request.headers.get('x-forwarded-proto') ?? new URL(request.url).protocol.replace(':', '');
  return host ? `${proto}://${host}` : new URL(request.url).origin;
}
export function oauthCallbackUrl(request: Request, provider: string) {
  return `${publicBaseUrl(request)}/api/integrations/oauth/${provider}/callback`;
}
