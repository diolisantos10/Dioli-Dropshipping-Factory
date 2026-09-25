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
  response.headers.set('Cache-Control', 'private, no-store');
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
  // Machine access for the Railway cron service: a single route, a dedicated bearer secret, role SYSTEM.
  const cronToken = process.env.DDF_CRON_TOKEN;
  const bearer = request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
  if (request.nextUrl.pathname === '/api/jobs/run' && bearer) {
    if (cronToken && cronToken.length >= 32 && safeEqual(bearer, cronToken)) {
      const requestHeaders = new Headers(request.headers);
      requestHeaders.set('x-ddf-actor', 'system:cron');
      requestHeaders.set('x-ddf-role', 'SYSTEM');
      requestHeaders.set('x-correlation-id', correlationId);
      return withSecurityHeaders(NextResponse.next({ request: { headers: requestHeaders } }), correlationId);
    }
    return withSecurityHeaders(new NextResponse('Token de automação inválido.', { status: 401 }), correlationId);
  }
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
      const password=passwordParts.join(':');
      let account={username:expectedUser,password:expectedPassword,role:process.env.DDF_ADMIN_ROLE||'ADMIN'};
      const configured=process.env.DDF_ADMIN_ACCOUNTS;
      if(configured){const accounts=JSON.parse(configured) as Array<{username:string;password:string;role:string}>;const match=accounts.find(item=>safeEqual(user,item.username)&&safeEqual(password,item.password));if(match&&['ADMIN','APPROVER','OPERATOR','VIEWER'].includes(match.role))account=match}
      if (safeEqual(user, account.username) && safeEqual(password, account.password)) {
        attempts.delete(client);
        const requestHeaders = new Headers(request.headers);
        requestHeaders.set('x-ddf-actor', user);
        requestHeaders.set('x-ddf-role', account.role);
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
