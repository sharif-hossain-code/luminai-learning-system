import { NextResponse, type NextRequest } from 'next/server';

const SESSION_COOKIES = ['__Host-luminai_session', 'luminai_session'];

/**
 * Cheap first gate for signed-in pages: without a session cookie, go straight to
 * sign-in and come back afterwards. The page layout still validates the session
 * with the API, because a cookie can be expired or revoked.
 */
export function proxy(request: NextRequest) {
  if (SESSION_COOKIES.some((name) => request.cookies.has(name))) return NextResponse.next();
  const signIn = new URL('/sign-in', request.url);
  signIn.searchParams.set('next', `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(signIn);
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/learning/:path*',
    '/learn/:path*',
    '/settings/:path*',
    '/onboarding/:path*',
    '/studio/:path*',
  ],
};
