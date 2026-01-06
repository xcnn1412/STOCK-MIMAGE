import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function middleware(request: NextRequest) {
  const userId = request.cookies.get('session_user_id')?.value
  const sessionId = request.cookies.get('session_id')?.value
  const { pathname } = request.nextUrl

  // Define public paths
  const isPublicPath = pathname === '/login' || pathname === '/register'

  let isValidSession = false

  // Verify session if cookie exists
  if (userId) {
      // Create a lightweight client just for verification
      const supabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      )
      
      try {
          // Check if user exists, is approved, AND has matching session ID
          const { data } = await supabase
            .from('profiles')
            .select('id, is_approved, active_session_id')
            .eq('id', userId)
            .single()
          
          // Verify approval AND session match
          // If active_session_id is null in DB (legacy/logged out), we treat as invalid if we want strict mode.
          // But for migration safety: if DB has ID, it MUST match.
          if (data && data.is_approved) {
              if (data.active_session_id && data.active_session_id !== sessionId) {
                  isValidSession = false // Session mismatch (logged in elsewhere)
              } else {
                  isValidSession = true
              }
          }
      } catch (e) {
          // If connection fails, we might default to blocking or allowing?
          // Security first: block if we can't verify.
          console.error("Middleware Auth Verification Failed", e)
      }
  }

  // 1. If not valid session (missing or fake/revoked) AND protected route
  if (!isValidSession && !isPublicPath) {
    const response = NextResponse.redirect(new URL('/login', request.url))
    
    // If they had a cookie but it was invalid, clear it
    if (userId) {
        response.cookies.delete('session_user_id')
        response.cookies.delete('session_role')
        response.cookies.delete('session_selfie_path')
        response.cookies.delete('session_id') 
    }
    
    return response
  }

  // 2. If valid session AND public path -> redirect to Dashboard
  if (isValidSession && isPublicPath) {
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
