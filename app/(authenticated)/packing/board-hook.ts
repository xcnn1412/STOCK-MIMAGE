// hook บอร์ดวันงานของใบจัดของ — server-only ไม่ใช่ 'use server' (ผู้เรียกตรวจสิทธิ์เองก่อน)
// ทีมรับของจากจุดรับของ (handOverPackingList) = หลักฐานว่ากำลังขนของขึ้นรถ → ใบงานหน้างานของงานเลื่อนเป็น "ขนของ" เอง
//
// โครงซ้ำกับ check-in/actions.ts::autoAdvanceOnsiteJobs โดยตั้งใจ: ไฟล์นั้นเป็น 'use server' ของเช็คอิน/เงินเดือน
// (export ฟังก์ชันภายในไม่ได้ และไม่ควรแตะไฟล์นั้นจากงานใบจัดของ) — กติกาตัดสินอยู่ที่ jobs/board-logic.ts::shouldAdvanceTo ตัวเดียวกัน
// — ไม่คืน error และไม่ throw ออกไป: การรับของสำเร็จไปแล้ว ห้ามล้มเพราะใบงาน
// — งานที่ไม่ได้มาจาก CRM (leadId ว่าง) ข้ามเงียบๆ · ทำซ้ำได้ (อยู่ที่ขนของ/เลยไปแล้ว = ไม่แตะ ห้ามถอยหลัง)
import { revalidatePath } from 'next/cache'
import type { createServiceClient } from '@/lib/supabase-server'
import { logActivity } from '@/lib/logger'
import { ONSITE_JOB_TYPE, ONSITE_LOADING_STATUS, shouldAdvanceTo } from '../jobs/board-logic'

type Db = ReturnType<typeof createServiceClient>

/** ใบงานหน้างานของงานที่ยังอยู่ก่อน "ขนของ" → ขนของ (ลำดับจาก job_settings status_onsite) · คืนจำนวนใบที่เลื่อน */
export async function advanceOnsiteJobsToLoading(
  db: Db,
  { leadId, eventId, actorId }: { leadId: string | null; eventId: string; actorId: string },
): Promise<number> {
  try {
    let lead = leadId
    if (!lead) {
      const { data: event, error } = await db.from('events').select('crm_lead_id').eq('id', eventId).maybeSingle<{ crm_lead_id: string | null }>()
      if (error) {
        console.error('[packing] auto-loading: fetch event failed:', error.message)
        return 0
      }
      lead = event?.crm_lead_id ?? null
    }
    if (!lead) return 0

    // ลำดับสถานะของไปป์ไลน์หน้างาน — แอดมินแก้ชุด/ลำดับได้ใน /jobs/settings จึงอ่านตอนรัน ไม่ hardcode
    const { data: statusRows, error: statusErr } = await db
      .from('job_settings')
      .select('value')
      .eq('category', `status_${ONSITE_JOB_TYPE}`)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
    if (statusErr) {
      console.error('[packing] auto-loading: fetch statuses failed:', statusErr.message)
      return 0
    }
    const ordered = (statusRows || []).map(r => r.value as string).filter(Boolean)

    const { data: jobs, error } = await db.from('jobs').select('id, status').eq('crm_lead_id', lead).eq('job_type', ONSITE_JOB_TYPE)
    if (error) {
      console.error('[packing] auto-loading: fetch jobs failed:', error.message)
      return 0
    }

    let moved = 0
    for (const job of (jobs || []) as { id: string; status: string | null }[]) {
      const oldStatus = job.status || ''
      if (!shouldAdvanceTo(oldStatus, ONSITE_LOADING_STATUS, ordered)) continue

      const { error: updErr } = await db
        .from('jobs')
        .update({ status: ONSITE_LOADING_STATUS, updated_at: new Date().toISOString() })
        .eq('id', job.id)
        .eq('status', oldStatus)
      if (updErr) {
        console.error('[packing] auto-loading: update failed:', updErr.message)
        continue
      }
      moved++

      // ไทม์ไลน์ของใบงาน (job_activities) แบบเดียวกับเช็คอินหน้างาน
      await db.from('job_activities').insert({
        job_id: job.id,
        created_by: actorId,
        activity_type: 'status_change',
        description: 'ขนของอัตโนมัติ: ทีมรับของจากจุดรับของแล้ว',
        old_status: oldStatus,
        new_status: ONSITE_LOADING_STATUS,
      })
      await logActivity('AUTO_LOADING_POOL_JOB', { jobId: job.id, jobType: ONSITE_JOB_TYPE, leadId: lead, eventId, oldStatus })
      revalidatePath(`/jobs/${job.id}`)
    }

    revalidatePath('/jobs')
    revalidatePath('/jobs/tracking')
    return moved
  } catch (e) {
    console.error('[packing] auto-loading threw:', e)
    return 0
  }
}
