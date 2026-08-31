/* eslint-disable no-console */
// Backfill พูลงาน — สร้างใบงาน (กราฟิก + หน้างาน) ให้งาน accepted เดิมที่ "ยังไม่จบจริง"
// Run:  npx tsx scripts/backfill-jobs-pool.ts
//
// รันหลัง migration ต่อไปนี้เท่านั้น (ต้องมีสถานะ 'รอรับงาน' ใน job_settings ก่อน):
//   supabase/migrations/20260831_jobs_pool_awaiting_claim.sql
//   supabase/migrations/20260831_jobs_pool_claim.sql
//   supabase/migrations/20260831_event_kits.sql
//
// กติกา:
//   • งาน = crm_leads ที่ status = 'accepted' และยังไม่ถูก archive
//   • ข้าม ถ้ามีใบงานของงานนั้นอยู่แล้ว (jobs.crm_lead_id) — ทำให้รันซ้ำได้ รอบสองสร้าง 0 ใบ
//   • ข้าม ถ้า "จบจริงแล้ว" = มีอีเวนต์ผูกอยู่และทุกใบ status = 'completed'
//                          หรือ วันจบงาน (event_end_date ?? event_date) ผ่านไปแล้ว (เทียบวันไทย)
//   • งานที่ยังไม่มีอีเวนต์เลยแต่วันงานยังไม่ผ่าน (หรือยังไม่กำหนดวัน) = สร้างใบงานให้
//   • ใบงานที่สร้างมี shape เดียวกับ createJobsFromLead ใน app/(authenticated)/jobs/actions.ts
//   • ไม่ยิงแจ้งเตือน (backfill ทีเดียวหลายสิบงาน = สแปมกระดิ่งทั้งทีม)

import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

config({ path: '.env.local' })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

/** YYYY-MM-DD ตามโซนเวลา Asia/Bangkok (เทียบกับ event_date ที่เป็น DATE ได้ตรงตัวแบบ string) */
function todayBangkok(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })
}

type Lead = {
  id: string
  customer_name: string | null
  event_details: string | null
  package_name: string | null
  event_date: string | null
  event_end_date: string | null
  event_location: string | null
  notes: string | null
  assigned_graphics: string[] | null
  assigned_staff: string[] | null
}

type LeadEvent = { crm_lead_id: string | null; status: string | null }

/**
 * สถานะแรกของแต่ละฝ่าย = แถว is_active ที่ sort_order ต่ำสุด — ตรรกะเดียวกับ createJobsFromLead
 * (หลัง migration 20260831_jobs_pool_awaiting_claim.sql แถวนั้นคือ 'awaiting_claim' = รอรับงาน)
 */
async function initialStatuses(): Promise<{ graphic: string; onsite: string }> {
  const lowest = async (category: string) => {
    const { data, error } = await supabase
      .from('job_settings')
      .select('value')
      .eq('category', category)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .limit(1)
    if (error) throw new Error(`อ่าน job_settings (${category}) ไม่ได้: ${error.message}`)
    return (data?.[0]?.value as string | undefined) ?? null
  }

  const graphic = (await lowest('status_graphic')) || 'pending'
  const onsite = (await lowest('status_onsite')) || 'preparing'

  if (graphic !== 'awaiting_claim' || onsite !== 'awaiting_claim') {
    console.warn(
      `! สถานะเริ่มต้นไม่ใช่ "awaiting_claim" (graphic=${graphic}, onsite=${onsite}) — ` +
      'ยังไม่ได้รัน supabase/migrations/20260831_jobs_pool_awaiting_claim.sql ใช่ไหม?'
    )
  }
  return { graphic, onsite }
}

/** ผู้สร้างใบงานที่ backfill — ไม่มี session ในสคริปต์ จึงใช้แอดมินคนแรกเป็นเจ้าของแถว */
async function pickCreator(): Promise<string | null> {
  const { data } = await supabase
    .from('profiles')
    .select('id')
    .eq('role', 'admin')
    .order('created_at', { ascending: true })
    .limit(1)
  return (data?.[0]?.id as string | undefined) ?? null
}

async function main() {
  const { graphic: graphicStatus, onsite: onsiteStatus } = await initialStatuses()
  const createdBy = await pickCreator()
  const today = todayBangkok()
  console.log(`• วันนี้ (เวลาไทย): ${today}`)
  console.log(`• สถานะแรก: กราฟิก=${graphicStatus} · หน้างาน=${onsiteStatus}`)
  console.log(`• created_by: ${createdBy ?? '(ไม่พบแอดมิน — ปล่อยว่าง)'}`)

  const { data: leadRows, error: leadErr } = await supabase
    .from('crm_leads')
    .select('id, customer_name, event_details, package_name, event_date, event_end_date, event_location, notes, assigned_graphics, assigned_staff')
    .eq('status', 'accepted')
    .is('archived_at', null)
    .order('event_date', { ascending: true, nullsFirst: false })
  if (leadErr) throw new Error(`อ่าน crm_leads ไม่ได้: ${leadErr.message}`)

  const leads = (leadRows || []) as unknown as Lead[]
  console.log(`• งาน accepted ที่ยังไม่ archive: ${leads.length} งาน\n`)
  if (leads.length === 0) {
    console.log('ไม่มีงานให้ backfill')
    return
  }

  const leadIds = leads.map(l => l.id)

  // ใบงานที่มีอยู่แล้ว (รวมที่ archive แล้ว) — มีแถวเดียวก็ถือว่างานนี้เคยส่งต่อ/เคยถูก backfill
  const { data: jobRows, error: jobErr } = await supabase
    .from('jobs')
    .select('crm_lead_id')
    .in('crm_lead_id', leadIds)
    .limit(10000)
  if (jobErr) throw new Error(`อ่าน jobs ไม่ได้: ${jobErr.message}`)
  const leadsWithJobs = new Set((jobRows || []).map(j => j.crm_lead_id as string).filter(Boolean))

  // อีเวนต์ของงานเหล่านี้ — ใช้ตัดสินว่า "จบจริง" (ทุกใบ completed)
  const { data: eventRows, error: eventErr } = await supabase
    .from('events')
    .select('crm_lead_id, status')
    .in('crm_lead_id', leadIds)
    .limit(10000)
  if (eventErr) throw new Error(`อ่าน events ไม่ได้: ${eventErr.message}`)
  const eventsByLead = new Map<string, LeadEvent[]>()
  for (const e of (eventRows || []) as unknown as LeadEvent[]) {
    if (!e.crm_lead_id) continue
    const list = eventsByLead.get(e.crm_lead_id)
    if (list) list.push(e)
    else eventsByLead.set(e.crm_lead_id, [e])
  }

  let createdLeads = 0
  let createdJobs = 0
  let skippedHadJobs = 0
  let skippedFinished = 0
  const failures: string[] = []

  for (const lead of leads) {
    const label = `${lead.customer_name || 'ไม่ระบุชื่อ'} (${lead.id.slice(0, 8)})`

    if (leadsWithJobs.has(lead.id)) {
      skippedHadJobs++
      console.log(`  ข้าม  ${label} — มีใบงานอยู่แล้ว`)
      continue
    }

    const events = eventsByLead.get(lead.id) || []
    const allEventsCompleted = events.length > 0 && events.every(e => e.status === 'completed')
    const endDate = lead.event_end_date || lead.event_date
    const datePassed = !!endDate && endDate < today

    if (allEventsCompleted || datePassed) {
      skippedFinished++
      const why = allEventsCompleted ? 'อีเวนต์ปิดครบแล้ว' : `วันงานผ่านแล้ว (${endDate})`
      console.log(`  ข้าม  ${label} — ${why}`)
      continue
    }

    // shape เดียวกับ createJobsFromLead (app/(authenticated)/jobs/actions.ts)
    const baseJob = {
      crm_lead_id: lead.id,
      title: `${lead.customer_name} — ${lead.event_details || lead.package_name || 'งาน'}`,
      customer_name: lead.customer_name,
      event_date: lead.event_date,
      event_location: lead.event_location,
      notes: lead.notes,
      created_by: createdBy,
      priority: 'medium' as const,
      assigned_to: [] as string[],
      assigned_graphics: [] as string[],
      assigned_staff: [] as string[],
      tags: [] as string[],
    }

    const graphicJob = {
      ...baseJob,
      job_type: 'graphic',
      status: graphicStatus,
      assigned_to: lead.assigned_graphics || [],
      assigned_graphics: lead.assigned_graphics || [],
    }

    const onsiteJob = {
      ...baseJob,
      job_type: 'onsite',
      status: onsiteStatus,
      assigned_to: lead.assigned_staff || [],
      assigned_staff: lead.assigned_staff || [],
    }

    const { data: inserted, error: insertErr } = await supabase
      .from('jobs')
      .insert([graphicJob, onsiteJob])
      .select('id')

    if (insertErr) {
      failures.push(`${label}: ${insertErr.message}`)
      console.log(`  ล้ม   ${label} — ${insertErr.message}`)
      continue
    }

    createdLeads++
    createdJobs += inserted?.length ?? 2
    console.log(`  สร้าง ${label} — ใบงานกราฟิก + หน้างาน (วันงาน ${lead.event_date ?? 'ยังไม่กำหนด'})`)
  }

  console.log('')
  console.log(`สรุป: สร้าง ${createdLeads} งาน (${createdJobs} ใบงาน) · ` +
    `ข้าม ${skippedHadJobs} งาน (มีใบงานแล้ว) · ` +
    `ข้าม ${skippedFinished} งาน (จบแล้ว/วันงานผ่าน)`)

  if (failures.length > 0) {
    console.error(`\n✗ สร้างไม่สำเร็จ ${failures.length} งาน:`)
    for (const f of failures) console.error(`  - ${f}`)
    process.exit(1)
  }
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error('\n✗ Backfill ล้มเหลว:', err instanceof Error ? err.message : err)
    process.exit(1)
  })
