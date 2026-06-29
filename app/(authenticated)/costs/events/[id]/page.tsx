import { supabaseServer as supabase } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import { getFinanceCategories, getAllCategoryItems, getStaffProfiles } from '@/app/(authenticated)/finance/settings-actions'
import EventCostDetailView from './event-cost-detail-view'

export const revalidate = 0

export default async function EventCostDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const { data: jobEvent } = await supabase
    .from('job_cost_events')
    .select(`
      *,
      job_cost_items(*)
    `)
    .eq('id', id)
    .single()

  if (!jobEvent) redirect('/costs/events')

  // แนบสถานะใบเบิกให้แต่ละรายการต้นทุนที่ auto-สร้างจากใบเบิก (notes = "<claim_number>::<claimId>")
  // เพื่อโชว์ badge สถานะ (จ่ายแล้ว/รอจ่ายสิ้นเดือน/...) ในตารางค่าใช้จ่าย
  {
    const items = jobEvent.job_cost_items || []
    const claimIds = items
      .map((i: any) => String(i.notes || '').match(/::(.+)$/)?.[1])
      .filter(Boolean) as string[]
    if (claimIds.length) {
      const { data: statuses } = await supabase
        .from('expense_claims')
        .select('id, status')
        .in('id', claimIds)
      const stMap = new Map((statuses || []).map(s => [s.id, s.status]))
      items.forEach((i: any) => {
        const cid = String(i.notes || '').match(/::(.+)$/)?.[1]
        if (cid) i.claim_status = stMap.get(cid) ?? null
      })
    }
  }

  // ดึงใบเบิกที่ผูกกับ event นี้
  let expenseClaims: any[] = []
  if (jobEvent.source_event_id) {
    const { data } = await supabase
      .from('expense_claims')
      .select(`
        *,
        submitter:profiles!expense_claims_submitted_by_fkey(id, full_name)
      `)
      .eq('job_event_id', jobEvent.source_event_id)
      .order('created_at', { ascending: false })

    expenseClaims = data || []
  }

  const [categories, categoryItems, staffProfiles] = await Promise.all([
    getFinanceCategories(),
    getAllCategoryItems(),
    getStaffProfiles(),
  ])

  return (
    <EventCostDetailView
      jobEvent={jobEvent as any}
      expenseClaims={expenseClaims}
      categories={categories}
      categoryItems={categoryItems}
      staffProfiles={staffProfiles}
    />
  )
}
