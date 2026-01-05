import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const userId = request.cookies.get('session_user_id')?.value
  const { pathname } = request.nextUrl

  // Define public paths (login and register)
  // Even if register is currently a tab in /login, we can include it for future-proofing
  const isPublicPath = pathname === '/login' || pathname === '/register'

  // 1. If not logged in and trying to access a protected route
  if (!userId && !isPublicPath) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // 2. If already logged in and trying to access login/register
  if (userId && isPublicPath) {
    // Redirect to dashboard or any main page
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return NextResponse.next()
}

// See "Matching Paths" below to learn more
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - images (public images)
     */
    '/((?!api|_next/static|_next/image|favicon.ico|images).*)',
  ],
}
