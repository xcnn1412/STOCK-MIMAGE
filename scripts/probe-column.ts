import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
config({ path: '.env.local' })
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
s.from('expense_claims').select('id, actual_spent_items').limit(1).then(({ error }) => {
  console.log(error ? `NOT APPLIED: ${error.message}` : 'APPLIED')
})
