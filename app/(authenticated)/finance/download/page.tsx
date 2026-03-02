import { getClaims } from '../actions'
import { getFinanceCategories } from '../settings-actions'
import FinanceDownloadView from './finance-download-view'
import type { ExpenseClaim } from '../../costs/types'
import { createServiceClient } from '@/lib/supabase-server'

export const revalidate = 0

export const metadata = {
  title: 'ดาวน์โหลดรายงาน — Finance',
  description: 'ส่งออกข้อมูลใบเบิก .xlsx / .pdf สำหรับสำนักงานบัญชี',
}

export default async function DownloadPage() {
  const supabase = createServiceClient()
  const [{ data }, categories, { data: profiles }] = await Promise.all([
    getClaims(),
    getFinanceCategories(),
    supabase.from('profiles').select('id, full_name, nickname, national_id, address'),
  ])

  // Build profile map
  const profileMap: Record<string, { nickname: string | null; national_id: string | null; address: string | null }> = {}
  ;(profiles || []).forEach((p: any) => {
    profileMap[p.id] = { nickname: p.nickname, national_id: p.national_id, address: p.address }
  })

  return (
    <FinanceDownloadView
      claims={(data || []) as unknown as ExpenseClaim[]}
      categories={categories}
      profileMap={profileMap}
    />
  )
}
