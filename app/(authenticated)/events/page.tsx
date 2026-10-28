import { getEventAccess } from '@/lib/event-permissions'
import { supabaseServer as supabase, createServiceClient } from '@/lib/supabase-server'
import { readAllRows } from '@/lib/read-all-rows'
import { getCrmSettings } from '../crm/actions'
import EventsView, { type EventStaffChip } from './events-view'
import type { EventLog } from './events-log-sheet'

export const revalidate = 0

export default async function EventsPage() {
  // admin หรือคนที่เปิดสิทธิ์ไว้ในหน้าตั้งค่า (แยกสร้าง-แก้ไข กับ ปิดงาน)
  const access = await getEventAccess()

  const { data: events } = await supabase.from('events').select('*').order('event_date', { ascending: false })

  // งานต้นทาง (CRM) ของแต่ละอีเวนต์ — ลิงก์กลับจากการ์ดอีเวนต์ไปหางาน/พูลงาน
  const leadIds = [...new Set(
    (events || []).map(e => (e as { crm_lead_id?: string | null }).crm_lead_id).filter((v): v is string => !!v)
  )]
  const leadByEvent: Record<string, { leadId: string; customerName: string | null }> = {}
  if (leadIds.length > 0) {
    const serviceForLeads = createServiceClient()
    const { data: leads } = await serviceForLeads
      .from('crm_leads').select('id, customer_name').in('id', leadIds)
    const nameById = new Map((leads || []).map(l => [l.id as string, (l.customer_name as string | null) ?? null]))
    for (const e of events || []) {
      const lid = (e as { crm_lead_id?: string | null }).crm_lead_id
      if (lid && nameById.has(lid)) leadByEvent[e.id] = { leadId: lid, customerName: nameById.get(lid) ?? null }
    }
  }

  const serviceClient = createServiceClient()

  // เจ้าหน้าที่ของแต่ละอีเวนต์ — event_staff เป็นที่เดียวที่ถูกต้อง (ชื่อเล่นก่อน ไม่มีค่อยใช้ชื่อเต็ม)
  // ป้ายหน้าที่แปลจาก crm_settings หมวด staff_role
  // ponytail: อ่านทั้งตาราง (ราว 600 แถว) แทน .in(ids) — อีเวนต์หลายร้อยใบทำ URL ยาวเกิน ถ้าโตเป็นหลายพันค่อยกรองด้วยวันงาน
  type StaffRow = { event_id: string; role: string; profiles: { full_name: string | null; nickname: string | null } | { full_name: string | null; nickname: string | null }[] | null }
  type RoleSetting = { value: string; label_th: string | null; label_en: string | null; color: string | null }
  const [{ rows: staffRows }, { data: roleSettings }] = await Promise.all([
    readAllRows<StaffRow>((from, to) =>
      serviceClient
        .from('event_staff')
        .select('event_id, role, profiles:user_id(full_name, nickname)')
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to)
    ),
    getCrmSettings('staff_role'),
  ])
  // สีป้าย = สีของหน้าที่ที่ตั้งไว้ใน CRM (ชุดเดียวกับบอร์ดวันงาน) — หน้าที่ที่ไม่มีในตั้งค่าใช้สีเทา
  const roleSetting = new Map(((roleSettings || []) as RoleSetting[]).map(s => [s.value, s]))
  const staffByEvent: Record<string, EventStaffChip[]> = {}
  for (const s of staffRows) {
    const p = Array.isArray(s.profiles) ? s.profiles[0] : s.profiles
    const setting = roleSetting.get(s.role)
    const list = staffByEvent[s.event_id] || (staffByEvent[s.event_id] = [])
    list.push({
      name: p?.nickname || p?.full_name || 'ไม่พบผู้ใช้',
      role: setting?.label_th || setting?.label_en || s.role,
      color: setting?.color || '#71717a',
    })
  }

  const { data: logs } = await serviceClient
    .from('activity_logs')
    .select(`
      id,
      action_type,
      details,
      created_at,
      user:user_id (full_name, role)
    `)
    .in('action_type', ['CREATE_EVENT', 'UPDATE_EVENT', 'DELETE_EVENT', 'CLOSE_EVENT', 'LINK_EVENT_TO_CRM', 'UNLINK_EVENT_FROM_CRM'])
    .order('created_at', { ascending: false })
    .limit(200)

  return (
    <EventsView
      events={events || []}
      canEdit={access.edit}
      canClose={access.close}
      logs={(logs || []) as unknown as EventLog[]}
      leadByEvent={leadByEvent}
      staffByEvent={staffByEvent}
    />
  )
}
