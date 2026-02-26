/**
 * One-time migration script: Hash all existing plaintext PINs.
 * 
 * Usage: npx tsx scripts/hash-existing-pins.ts
 * 
 * Requires: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local
 */

import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'
import bcrypt from 'bcryptjs'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false }
})

async function main() {
  console.log('🔐 Fetching all profiles with PINs...')

  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, pin, full_name')

  if (error) {
    console.error('❌ Failed to fetch profiles:', error.message)
    process.exit(1)
  }

  if (!profiles || profiles.length === 0) {
    console.log('✅ No profiles found. Nothing to do.')
    return
  }

  let updated = 0
  let skipped = 0

  for (const profile of profiles) {
    if (!profile.pin) {
      console.log(`⏭️  ${profile.full_name || profile.id}: No PIN set, skipping`)
      skipped++
      continue
    }

    // Check if already hashed (bcrypt hashes start with $2a$ or $2b$)
    if (profile.pin.startsWith('$2a$') || profile.pin.startsWith('$2b$')) {
      console.log(`⏭️  ${profile.full_name || profile.id}: PIN already hashed, skipping`)
      skipped++
      continue
    }

    // Hash the plaintext PIN
    const hashedPin = await bcrypt.hash(profile.pin, 12)

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ pin: hashedPin })
      .eq('id', profile.id)

    if (updateError) {
      console.error(`❌ Failed to update ${profile.full_name || profile.id}:`, updateError.message)
    } else {
      console.log(`✅ ${profile.full_name || profile.id}: PIN hashed successfully`)
      updated++
    }
  }

  console.log('')
  console.log(`📊 Results: ${updated} updated, ${skipped} skipped, ${profiles.length} total`)
  console.log('🔐 Migration complete!')
}

main().catch(console.error)
