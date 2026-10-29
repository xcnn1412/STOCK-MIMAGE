import { requireAuth } from '@/lib/auth'
import { supabaseServer as supabase } from '@/lib/supabase-server'
import DashboardView from './dashboard-view'
import type { Profile } from '@/types'
import ShelfAlerts from './shelf-alerts'
import { loadShelfHealth } from '@/app/(authenticated)/shelves/queries'
import { createServiceClient } from '@/lib/supabase-server'

export const revalidate = 0

export default async function StockDashboardPage() {
  const session = await requireAuth()
  const userId = session?.userId ?? ''

  // Fetch data in parallel
  const [
    { data: profile },
    { data: latestLog },
    { count: itemsCount },
    { data: items },
    { count: kitsCount },
    { data: activeKitsWithDetails }, // Kits assigned to events
    { count: usersCount },
    { data: templates },
    shelfHealth,
  ] = await Promise.all([
    // เฉพาะคอลัมน์ที่หน้านี้ใช้ (รายงาน L4) — ไม่ส่ง pin / active_session_id ไปเบราว์เซอร์
    supabase.from('profiles').select('id, full_name').eq('id', userId).single(),
    supabase.from('login_logs').select('login_at, latitude, longitude').eq('user_id', userId).order('login_at', { ascending: false }).limit(1).single(),
    supabase.from('items').select('*', { count: 'exact', head: true }),
    supabase.from('items').select('price, status'),
    supabase.from('kits').select('*', { count: 'exact', head: true }),
    supabase.from('kits').select('*, events(id, name, event_date, location), kit_contents(items(status, is_consumable))').not('event_id', 'is', null).order('created_at', { ascending: false }),
    supabase.from('profiles').select('*', { count: 'exact', head: true }),
    supabase.from('kit_templates').select('*, kit_template_contents(count)').order('created_at', { ascending: false }).limit(10),
    loadShelfHealth(createServiceClient()),
  ])

  return (
    <div className="space-y-6">
    <ShelfAlerts health={shelfHealth} />
    <DashboardView
      profile={profile as Profile | null}
      latestLog={latestLog as any}
      itemsCount={itemsCount}
      items={(items || []) as any}
      kitsCount={kitsCount}
      activeKitsWithDetails={(activeKitsWithDetails || []) as any}
      usersCount={usersCount}
      templates={(templates || []) as any}
    />
    </div>
  )
}
