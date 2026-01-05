import { cookies } from 'next/headers'
import { supabase } from '@/lib/supabase'
import DashboardView from './dashboard-view'

export const revalidate = 0

export default async function DashboardPage() {
  const cookieStore = await cookies()
  const userId = cookieStore.get('session_user_id')?.value
  const selfiePath = cookieStore.get('session_selfie_path')?.value

  // Fetch data in parallel
  const [
    { data: profile },
    { data: latestLog },
    { count: itemsCount },
    { data: items },
    { count: kitsCount },
    { data: activeKitsWithDetails }, // Kits assigned to events
    { count: usersCount },
    { data: templates }
  ] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', userId).single(),
    supabase.from('login_logs').select('*').eq('user_id', userId).order('login_at', { ascending: false }).limit(1).single(),
    supabase.from('items').select('*', { count: 'exact', head: true }),
    supabase.from('items').select('price, status'),
    supabase.from('kits').select('*', { count: 'exact', head: true }),
    supabase.from('kits').select('*, events(id, name, event_date, location)').not('event_id', 'is', null).order('created_at', { ascending: false }),
    supabase.from('profiles').select('*', { count: 'exact', head: true }),
    supabase.from('kit_templates').select('*, kit_template_contents(count)').order('created_at', { ascending: false }).limit(10)
  ])

  const selfieUrl = selfiePath 
    ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/login_selfies/${selfiePath}`
    : null

  return (
    <DashboardView 
        profile={profile}
        latestLog={latestLog}
        itemsCount={itemsCount}
        items={items || []}
        kitsCount={kitsCount}
        activeKitsWithDetails={activeKitsWithDetails || []}
        usersCount={usersCount}
        selfieUrl={selfieUrl}
        templates={templates || []}
    />
  )
}
