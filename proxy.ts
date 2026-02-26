import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Module-route mapping (inlined to avoid importing components in edge runtime)
const MODULE_ROUTES: Record<string, string[]> = {
  stock: ['/stock/dashboard', '/items', '/kits', '/example-kits'],
  events: ['/events'],
  kpi: ['/kpi'],
  costs: ['/costs'],
  finance: ['/finance'],
  admin: ['/logs', '/users'],
}

function getModuleForPath(pathname: string): { moduleKey: string; adminOnly: boolean } | null {
  for (const [key, routes] of Object.entries(MODULE_ROUTES)) {
    for (const route of routes) {
      if (pathname === route || pathname.startsWith(route + '/')) {
        return { moduleKey: key, adminOnly: key === 'admin' }
      }
    }
  }
  return null
}

export async function proxy(request: NextRequest) {
  const userId = request.cookies.get('session_user_id')?.value
  const sessionId = request.cookies.get('session_id')?.value
  const role = request.cookies.get('session_role')?.value
  const { pathname } = request.nextUrl

  // Define public paths
  const isPublicPath = pathname === '/login' || pathname === '/register'

  let isValidSession = false
  let allowedModules: string[] = ['stock']

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
            .select('id, is_approved, active_session_id, allowed_modules, role')
            .eq('id', userId)
            .single()
          
          // Verify approval AND session match
          if (data && data.is_approved) {
              if (data.active_session_id && data.active_session_id !== sessionId) {
                  isValidSession = false // Session mismatch (logged in elsewhere)
              } else {
                  isValidSession = true
                  // Get allowed modules
                  if (data.allowed_modules && Array.isArray(data.allowed_modules)) {
                      allowedModules = data.allowed_modules
                  }
                  // Admin always gets admin module
                  if (data.role === 'admin' && !allowedModules.includes('admin')) {
                      allowedModules = [...allowedModules, 'admin']
                  }
              }
          }
      } catch (e) {
          console.error("Proxy Auth Verification Failed", e)
      }
  }

  // 1. If not valid session AND protected route -> redirect to login
  if (!isValidSession && !isPublicPath) {
    const response = NextResponse.redirect(new URL('/login', request.url))
    
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

  // 3. Module access guard — check if user has permission for this route
  if (isValidSession && !isPublicPath) {
    const moduleInfo = getModuleForPath(pathname)
    if (moduleInfo) {
      const { moduleKey, adminOnly } = moduleInfo
      
      // Admin-only check
      if (adminOnly && role !== 'admin') {
        return NextResponse.redirect(new URL('/dashboard', request.url))
      }
      
      // Module permission check
      if (!allowedModules.includes(moduleKey)) {
        return NextResponse.redirect(new URL('/dashboard', request.url))
      }
    }
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
