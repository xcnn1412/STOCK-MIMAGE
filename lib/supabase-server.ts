import { createClient } from '@supabase/supabase-js'

/**
 * Server-side Supabase client using SERVICE_ROLE_KEY.
 * This key bypasses RLS — use ONLY in server actions and server components.
 * 
 * NEVER import this in client components or expose the key to the browser.
 */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is not configured')
  }

  if (!key) {
    // In development, fall back to anon key with a warning
    if (process.env.NODE_ENV === 'development') {
      console.warn('[SECURITY WARNING] SUPABASE_SERVICE_ROLE_KEY is not set. Falling back to ANON_KEY. Set the service role key for proper server-side auth.')
      return createClient(
        url,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { auth: { persistSession: false } }
      )
    }
    // In production, throw — service role key is required
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured. This is required for server-side operations.')
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  })
}

// NOTE: Removed the module-level singleton `supabaseServer` to prevent
// stale connections and cold-start issues. Always use createServiceClient().

/**
 * Backward-compatible export. Uses Proxy to call createServiceClient()
 * on every property access, ensuring fresh connections.
 * 
 * @deprecated Use `createServiceClient()` directly instead.
 */
export const supabaseServer = new Proxy({} as ReturnType<typeof createServiceClient>, {
  get(_target, prop, receiver) {
    const client = createServiceClient()
    const value = (client as any)[prop]
    if (typeof value === 'function') {
      return value.bind(client)
    }
    return value
  }
})
