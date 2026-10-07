import CrmDashboard from './crm-dashboard'
import { getLeads, getCrmSettings, getSystemUsers } from './actions'
import { createServiceClient } from '@/lib/supabase-server'
import { loadPackages } from '../packages/queries'

export const metadata = {
  title: 'CRM — Photobooth CRM',
  description: 'Manage your photobooth events and customers',
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

export default async function CrmPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams
  const all = one(sp.all) === '1'
  const daysParam = Number(one(sp.days))
  const days = Number.isInteger(daysParam) && daysParam >= 1 && daysParam <= 365 ? daysParam : 60
  const initialSearch = one(sp.q) ?? ''

  const [leadsResult, settingsResult, usersResult, totalResult, packages] = await Promise.all([
    getLeads(all ? undefined : { window: { days } }),
    getCrmSettings(),
    getSystemUsers(),
    // ponytail: นับงานที่ยังไม่เก็บเข้าคลังทั้งหมดครั้งเดียว (head) ไว้โชว์ "x จาก y ราย"
    createServiceClient().from('crm_leads').select('id', { count: 'exact', head: true }).is('archived_at', null),
    // แพ็กเกจที่เปิดใช้ (ตาราง packages) — ช่องแพ็กเกจในกล่องเพิ่มลูกค้า · ยังไม่รัน migration 20261011 = []
    loadPackages(createServiceClient()),
  ])
  const leads = leadsResult.data

  return (
    <CrmDashboard
      leads={leads}
      settings={settingsResult.data}
      users={usersResult.data}
      packages={packages.map(p => ({ id: p.id, name: p.name, price: p.price }))}
      window={{ days, all, shown: leads.length, total: totalResult.count ?? leads.length }}
      initialSearch={initialSearch}
    />
  )
}
