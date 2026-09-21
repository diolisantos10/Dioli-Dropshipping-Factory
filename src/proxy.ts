import { NextRequest, NextResponse } from 'next/server';

export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname === '/health') return NextResponse.next();
  const expectedUser = process.env.DDF_ADMIN_USER;
  const expectedPassword = process.env.DDF_ADMIN_PASSWORD;
  if (!expectedUser || !expectedPassword) {
    if (process.env.NODE_ENV !== 'production') return NextResponse.next();
    return new NextResponse('Autenticação não configurada.', { status: 503 });
  }
  const header = request.headers.get('authorization');
  if (header?.startsWith('Basic ')) {
    try {
      const [user, ...passwordParts] = Buffer.from(header.slice(6), 'base64').toString('utf8').split(':');
      if (user === expectedUser && passwordParts.join(':') === expectedPassword) return NextResponse.next();
    } catch { /* invalid authorization */ }
  }
  return new NextResponse('Acesso restrito à administração da DDF.', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="DDF", charset="UTF-8"', 'Cache-Control': 'no-store' },
  });
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
