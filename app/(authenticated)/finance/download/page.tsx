import { redirect } from 'next/navigation'
import { getClaims } from '../actions'
import { getFinanceCategories } from '../settings-actions'
import { getFinanceViewer } from '../viewer'
import FinanceDownloadView, { type WhtClaim, type WhtProfile } from './finance-download-view'
import type { ExpenseClaim } from '../../costs/types'
import { createServiceClient } from '@/lib/supabase-server'

export const revalidate = 0

export const metadata = {
  title: 'หัก ณ ที่จ่าย 3% — Finance',
  description: 'สรุปหัก ณ ที่จ่ายรายบุคคล สำหรับออกหนังสือรับรองและยื่น ภ.ง.ด.3 / 53',
}

export default async function DownloadPage() {
  // หน้านี้มีเลขบัตรประชาชนและที่อยู่ — แอดมินเท่านั้น ตรวจก่อนอ่านอะไรจากฐานข้อมูล
  const viewer = await getFinanceViewer()
  if (!viewer) redirect('/login')
  if (!viewer.isAdmin) redirect('/finance')

  const [{ data }, categories] = await Promise.all([
    getClaims(),
    getFinanceCategories(),
  ])

  // ส่งให้เบราว์เซอร์เฉพาะใบที่มีหัก ณ ที่จ่าย (หน้านี้แสดงแค่นั้น) และเฉพาะช่องที่หน้าใช้
  const claims: WhtClaim[] = ((data || []) as unknown as ExpenseClaim[])
    .filter(c => (c.withholding_tax_rate || 0) > 0)
    .map(c => ({
      id: c.id,
      status: c.status,
      expense_date: c.expense_date,
      created_at: c.created_at,
      submitted_by: c.submitted_by,
      submitter: c.submitter ?? null,
      amount: c.amount,
      vat_mode: c.vat_mode,
      withholding_tax_rate: c.withholding_tax_rate,
      bank_name: c.bank_name,
      bank_account_number: c.bank_account_number,
      account_holder_name: c.account_holder_name,
    }))

  // ข้อมูลส่วนตัวเฉพาะคนที่มีใบหัก ณ ที่จ่าย — ไม่ส่งของทุกคนในระบบ
  const submitterIds = [...new Set(claims.map(c => c.submitted_by).filter((id): id is string => !!id))]
  const profileMap: Record<string, WhtProfile> = {}
  if (submitterIds.length > 0) {
    const { data: profiles } = await createServiceClient()
      .from('profiles')
      .select('id, nickname, national_id, address')
      .in('id', submitterIds)
    for (const p of (profiles || []) as ({ id: string } & WhtProfile)[]) {
      profileMap[p.id] = { nickname: p.nickname ?? null, national_id: p.national_id ?? null, address: p.address ?? null }
    }
  }

  return (
    <FinanceDownloadView
      claims={claims}
      categories={categories}
      profileMap={profileMap}
    />
  )
}
