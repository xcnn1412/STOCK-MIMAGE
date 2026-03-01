import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Module-route mapping (inlined to avoid importing components in edge runtime)
const MODULE_ROUTES: Record<string, string[]> = {
  stock: ['/stock/dashboard', '/items', '/kits', '/example-kits'],
  events: ['/events'],
  kpi: ['/kpi'],
  costs: ['/costs'],
  crm: ['/crm'],
  finance: ['/finance'],
  admin: ['/logs', '/users', '/security'],
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

/**
 * Lightweight HMAC verification for Edge Runtime (middleware).
 * Uses Web Crypto API instead of Node.js crypto module.
 */
async function verifySessionTokenEdge(token: string, secret: string): Promise<{ userId: string; timestamp: number } | null> {
  if (!token) return null

  const parts = token.split(':')
  if (parts.length !== 3) return null

  const [userId, timestampStr, providedSignature] = parts
  if (!userId || !timestampStr || !providedSignature) return null

  const payload = `${userId}:${timestampStr}`

  // Use Web Crypto API (available in Edge Runtime)
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signatureBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(payload))
  const expectedSignature = Array.from(new Uint8Array(signatureBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')

  // Compare signatures (constant-time-ish for edge)
  if (providedSignature.length !== expectedSignature.length) return null
  let diff = 0
  for (let i = 0; i < providedSignature.length; i++) {
    diff |= providedSignature.charCodeAt(i) ^ expectedSignature.charCodeAt(i)
  }
  if (diff !== 0) return null

  // Check expiry (7 days)
  const timestamp = parseInt(timestampStr, 10)
  if (isNaN(timestamp)) return null
  if (Date.now() - timestamp > 7 * 24 * 60 * 60 * 1000) return null

  return { userId, timestamp }
}

export async function proxy(request: NextRequest) {
  const sessionToken = request.cookies.get('session_token')?.value
  const legacyUserId = request.cookies.get('session_user_id')?.value
  const sessionId = request.cookies.get('session_id')?.value
  const role = request.cookies.get('session_role')?.value
  const { pathname } = request.nextUrl

  // Define public paths
  const isPublicPath = pathname === '/login' || pathname === '/register'

  let userId: string | null = null
  let isValidSession = false
  let allowedModules: string[] = ['stock']

  // 1. Try to verify signed session token first
  const sessionSecret = process.env.SESSION_SECRET || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'fallback-dev-secret-change-in-production'
  if (sessionToken) {
    const verified = await verifySessionTokenEdge(sessionToken, sessionSecret)
    if (verified) {
      userId = verified.userId
    }
  }

  // 2. Fallback to legacy cookie for backward compatibility
  if (!userId && legacyUserId) {
    userId = legacyUserId
  }

  // 3. Verify session against DB if we have a userId
  if (userId) {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    try {
      const { data } = await supabase
        .from('profiles')
        .select('id, is_approved, active_session_id, allowed_modules, role')
        .eq('id', userId)
        .single()

      if (data && data.is_approved) {
        if (data.active_session_id && data.active_session_id !== sessionId) {
          isValidSession = false // Session mismatch (logged in elsewhere)
        } else {
          isValidSession = true
          if (data.allowed_modules && Array.isArray(data.allowed_modules)) {
            allowedModules = data.allowed_modules
          }
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

    if (userId || legacyUserId) {
      response.cookies.delete('session_token')
      response.cookies.delete('session_user_id')
      response.cookies.delete('session_role')
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
