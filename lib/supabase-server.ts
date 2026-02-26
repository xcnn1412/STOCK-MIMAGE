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

  if (!url || !key) {
    // Fallback to anon key if service role key is not set (dev compatibility)
    return createClient(
      url || process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } }
    )
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  })
}

/**
 * Re-export as supabaseServer for convenience in page.tsx files
 * that use a singleton pattern: `import { supabaseServer } from '@/lib/supabase-server'`
 */
export const supabaseServer = createServiceClient()
