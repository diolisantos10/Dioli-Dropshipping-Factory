import { NextRequest, NextResponse } from 'next/server';

const attempts = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 12;

function withSecurityHeaders(response: NextResponse, correlationId: string) {
  response.headers.set('X-Correlation-ID', correlationId);
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  response.headers.set('Content-Security-Policy', "default-src 'self'; img-src 'self' https: data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  return response;
}

function safeEqual(left: string, right: string) {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a[index] ^ b[index];
  return difference === 0;
}

export function proxy(request: NextRequest) {
  const correlationId = request.headers.get('x-correlation-id')?.match(/^[0-9a-f-]{36}$/i)?.[0] ?? crypto.randomUUID();
  if (request.nextUrl.pathname === '/health') return withSecurityHeaders(NextResponse.next(), correlationId);
  const expectedUser = process.env.DDF_ADMIN_USER;
  const expectedPassword = process.env.DDF_ADMIN_PASSWORD;
  if (!expectedUser || !expectedPassword) {
    if (process.env.NODE_ENV !== 'production') return withSecurityHeaders(NextResponse.next(), correlationId);
    return withSecurityHeaders(new NextResponse('Autenticação não configurada.', { status: 503 }), correlationId);
  }
  const client = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const now = Date.now();
  const current = attempts.get(client);
  if (current && current.resetAt > now && current.count >= MAX_ATTEMPTS) {
    return withSecurityHeaders(new NextResponse('Muitas tentativas. Aguarde um minuto.', { status: 429, headers: { 'Retry-After': '60' } }), correlationId);
  }
  const header = request.headers.get('authorization');
  if (header?.startsWith('Basic ')) {
    try {
      const [user, ...passwordParts] = Buffer.from(header.slice(6), 'base64').toString('utf8').split(':');
      if (safeEqual(user, expectedUser) && safeEqual(passwordParts.join(':'), expectedPassword)) {
        attempts.delete(client);
        const requestHeaders = new Headers(request.headers);
        requestHeaders.set('x-ddf-actor', user);
        requestHeaders.set('x-ddf-role', process.env.DDF_ADMIN_ROLE || 'ADMIN');
        requestHeaders.set('x-correlation-id', correlationId);
        return withSecurityHeaders(NextResponse.next({ request: { headers: requestHeaders } }), correlationId);
      }
    } catch { /* invalid authorization */ }
  }
  attempts.set(client, { count: current && current.resetAt > now ? current.count + 1 : 1, resetAt: current && current.resetAt > now ? current.resetAt : now + WINDOW_MS });
  return withSecurityHeaders(new NextResponse('Acesso restrito à administração da DDF.', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="DDF", charset="UTF-8"', 'Cache-Control': 'no-store' },
  }), correlationId);
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
