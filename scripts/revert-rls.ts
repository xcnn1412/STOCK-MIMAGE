/**
 * Revert RLS policies to allow anon access (restore data)
 * Then re-apply correct policies once SERVICE_ROLE_KEY is set up.
 * 
 * Usage: npx tsx scripts/revert-rls.ts
 */
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing env vars')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false }
})

async function main() {
  const tables = ['crm_settings', 'crm_leads', 'crm_activities', 'job_cost_events', 'job_cost_items']
  
  for (const table of tables) {
    console.log(`🔄 Fixing RLS for ${table}...`)
    
    // Drop the restrictive "Auth only" policy
    const { error: dropErr } = await supabase.rpc('exec_sql', {
      sql: `DROP POLICY IF EXISTS "Auth only" ON ${table};`
    })
    
    // Recreate the original open policy
    const { error: createErr } = await supabase.rpc('exec_sql', {
      sql: `CREATE POLICY IF NOT EXISTS "Allow all for authenticated" ON ${table} FOR ALL USING (true) WITH CHECK (true);`
    })
    
    if (dropErr) console.log(`  ⚠️  Drop failed (${dropErr.message}) — may not exist`)
    if (createErr) console.log(`  ⚠️  Create failed (${createErr.message})`)
    if (!dropErr && !createErr) console.log(`  ✅ ${table} restored`)
  }
  
  console.log('\n📊 Done! Refresh the app to see data.')
}

main().catch(console.error)
