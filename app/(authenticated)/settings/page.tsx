import { getFinanceCategories, getAllCategoryItems, getStaffProfiles } from '@/app/(authenticated)/finance/settings-actions'
import { getCrmSettings } from '@/app/(authenticated)/crm/actions'
import { getMetaTokenStatus } from '@/app/(authenticated)/content-planner/actions'
import type { CrmSetting } from '@/app/(authenticated)/crm/crm-dashboard'
import { getEventPermissionIds } from '@/lib/event-permissions'
import { requireAuth } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase-server'
import { requestOrigin } from '@/lib/request-origin'
import SettingsView from './settings-view'

export const revalidate = 0

export const metadata = {
  title: 'ตั้งค่าระบบ — Settings',
  description: 'จัดการการตั้งค่าทั้งหมดของระบบ',
}

// การ์ดการเชื่อมต่อ Claude (MCP) — เฉพาะ admin: นับการเชื่อมต่อที่ยังใช้งานได้ของทุกคน + ที่อยู่ /api/mcp
async function getMcpSummary(): Promise<{ liveCount: number; endpoint: string } | null> {
  const auth = await requireAuth()
  if (auth?.role !== 'admin') return null
  const { count } = await createServiceClient()
    .from('oauth_tokens')
    .select('id', { count: 'exact', head: true })
    .is('revoked_at', null)
    .gt('refresh_expires_at', new Date().toISOString())
  return { liveCount: count ?? 0, endpoint: `${await requestOrigin()}/api/mcp` }
}

export default async function SettingsPage() {
  const [categories, categoryItems, staffProfiles, { data: crmSettings }, metaToken, eventPermissionIds, mcp] = await Promise.all([
    getFinanceCategories(false), // include inactive
    getAllCategoryItems(),
    getStaffProfiles(),
    getCrmSettings(),
    getMetaTokenStatus(),
    getEventPermissionIds(),
    getMcpSummary(),
  ])

  return (
    <SettingsView
      financeCategories={categories}
      categoryItems={categoryItems}
      staffProfiles={staffProfiles}
      crmSettings={(crmSettings as CrmSetting[] | null) || []}
      metaToken={metaToken}
      eventPermissionIds={eventPermissionIds}
      mcp={mcp}
    />
  )
}
