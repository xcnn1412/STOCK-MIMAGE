// ผู้รับ + ข้อความแจ้งเตือนกระดิ่งของใบจัดของ — server-only ไม่ใช่ 'use server' (ผู้เรียกตรวจสิทธิ์เองก่อน)
// ไฟล์นี้ไม่ยิงแจ้งเตือนเอง: ผู้เรียก (server action) ส่งผลให้ createNotifications ของ lib/notifications
// (กติกาโปรเจกต์: ไฟล์ที่ import lib/notifications ต้องเป็น 'use server' — scripts/ticket-attachments.check.ts)
import type { createServiceClient } from '@/lib/supabase-server'
import { packingTeamDepartments } from './permissions'

type Db = ReturnType<typeof createServiceClient>

/**
 * ผู้รับ packing_requested (งานตอบรับแล้วมีแพ็กเกจ) = สมาชิกทีมจัดของ (แผนกใน pool_duty_kits ที่อนุมัติแล้ว)
 * งานมีใบจัดของอยู่แล้ว = [] (ทีมรู้แล้ว ไม่แจ้งซ้ำ)
 */
export async function packingRequestedRecipients(db: Db, leadId: string): Promise<string[]> {
  const { data: lists } = await db.from('packing_lists').select('id').eq('lead_id', leadId).limit(1)
  if ((lists ?? []).length > 0) return []
  return packingTeamRecipients(db)
}

/** สมาชิกทีมจัดของ = ผู้ใช้ที่อนุมัติแล้วในแผนกของ pool_duty_kits (ไม่รวมแอดมินที่อยู่แผนกอื่น) */
export async function packingTeamRecipients(db: Db): Promise<string[]> {
  const departments = await packingTeamDepartments(db)
  if (departments.length === 0) return []
  const { data: members } = await db.from('profiles').select('id').eq('is_approved', true).in('department', departments)
  return (members ?? []).map(m => m.id as string)
}

/** ข้อความ packing_requested — reference crm_lead → กระดิ่งพาไป /jobs/tracking?tab=kits&lead=<id> */
export const packingRequestedMessage = (customerName: string | null | undefined) => ({
  title: `งานรอจัดของ: ${customerName || 'งานใหม่'}`,
  body: 'ทีมขายเลือกแพ็กเกจแล้ว — เปิดใบจัดของได้จากแท็บจัดของในพูลงาน',
})

/** ผู้รับ packing_ready = หัวหน้างาน (jobs.claimed_by ของใบงานหน้างานของงาน) + ทุกคนใน event_staff ของอีเวนต์ */
export async function packingReadyRecipients(db: Db, list: { event_id: string; lead_id: string | null }): Promise<string[]> {
  const [jobsRes, staffRes] = await Promise.all([
    list.lead_id
      ? db.from('jobs').select('claimed_by').eq('crm_lead_id', list.lead_id).eq('job_type', 'onsite').is('archived_at', null)
      : Promise.resolve({ data: [] as { claimed_by: string | null }[], error: null }),
    db.from('event_staff').select('user_id').eq('event_id', list.event_id),
  ])
  return [
    ...((jobsRes.data ?? []) as { claimed_by: string | null }[]).flatMap(j => (j.claimed_by ? [j.claimed_by] : [])),
    ...((staffRes.data ?? []) as { user_id: string }[]).map(s => s.user_id),
  ]
}

/** ข้อความ packing_ready — reference packing_list → กระดิ่งพาไป /packing/<id> */
export const packingReadyMessage = (eventName: string, spotName: string | null) => ({
  title: `ของพร้อมรับ: ${eventName}`,
  body: spotName ? `วางไว้ที่ ${spotName} — สแกน QR ที่จุดรับของตอนมารับ` : 'ทีมจัดของจัดของเสร็จแล้ว',
})

/** ข้อความ packing_returned (ทีมหน้างานคืนของแล้ว → ทีมจัดของ) — reference packing_list → กระดิ่งพาไป /packing/<id> */
export const packingReturnedMessage = (eventName: string, spotName: string | null, damagedCount: number) => ({
  title: `คืนของแล้ว รอคืนชั้น: ${eventName}`,
  body: [
    spotName ? `ของวางไว้ที่ ${spotName}` : 'ทีมหน้างานคืนของแล้ว',
    damagedCount > 0 ? `มีของเสีย/ซ่อม/หาย ${damagedCount} รายการ` : null,
  ].filter(Boolean).join(' · '),
})
