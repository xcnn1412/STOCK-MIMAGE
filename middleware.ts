import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function middleware(request: NextRequest) {
  const userId = request.cookies.get('session_user_id')?.value
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
          // Check if user exists and is approved
          const { data } = await supabase
            .from('profiles')
            .select('id, is_approved')
            .eq('id', userId)
            .single()
          
          if (data && data.is_approved) {
              isValidSession = true
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
