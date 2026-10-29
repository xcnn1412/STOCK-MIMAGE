import { redirect } from 'next/navigation'
import { canDeleteLead } from '@/lib/crm-permissions'
import { createServiceClient } from '@/lib/supabase-server'
import { readAllRows } from '@/lib/read-all-rows'
import type { CrmDeletedLead } from '../types'
import TrashView from './trash-view'

export const metadata = {
    title: 'รายการที่ลบแล้ว — CRM',
    description: 'ลูกค้า CRM ที่ถูกลบ พร้อมข้อมูล ณ ตอนลบ',
}

// รายการลูกค้าที่ถูกลบ (crm_deleted_leads) — เห็นเฉพาะคนที่ลบได้ · รอบนี้ยังไม่มีปุ่มกู้คืน (ดูข้อมูลอย่างเดียว)
export default async function CrmTrashPage() {
    if (!(await canDeleteLead())) redirect('/crm')

    const supabase = createServiceClient()
    const { rows, error } = await readAllRows<CrmDeletedLead>((from, to) => supabase
        .from('crm_deleted_leads')
        .select('id, lead_id, customer_name, status, deleted_by, deleted_at, snapshot')
        .order('deleted_at', { ascending: false })
        .order('id')
        .range(from, to))

    const ids = [...new Set(rows.map(r => r.deleted_by).filter((v): v is string => !!v))]
    const { data: people } = ids.length
        ? await supabase.from('profiles').select('id, full_name').in('id', ids)
        : { data: [] }
    const names = Object.fromEntries((people || []).map(p => [p.id, p.full_name || '']))

    return <TrashView rows={rows} names={names} error={error?.message ?? null} />
}
