// แกนของการปิดอีเวนต์ (ไม่ใช่ 'use server' — ไม่ใช่ปลายทางที่ยิงจากเครือข่ายได้)
// ใช้ร่วมกันโดยหน้าปิดงานเดิม (events/actions.ts::processEventReturn — keepItemStatuses: false)
// และใบจัดของ (packing/actions.ts — คืนของ/ปิดงานจากใบ — keepItemStatuses: true เพราะสถานะของตั้งตอนคืน/คืนชั้นแล้ว)
// ผู้เรียกต้องตรวจสิทธิ์ปิดงาน (getEventManager('close')) เองก่อน · revalidate ชุดเดิมของหน้าปิดงานอยู่ในนี้
import { revalidatePath } from 'next/cache'
import type { createServiceClient } from '@/lib/supabase-server'
import { logActivity } from '@/lib/logger'
import { loadBookingsForEvent, recomputeKitPointers } from '@/lib/kit-bookings'
import { moveStock } from '@/lib/stock'
import type { Item } from '@/types'
import { isClosedEvent } from '../jobs/tracking/tracking-logic'
import { planReturnUse } from '../shelves/consumable-logic'

type Db = ReturnType<typeof createServiceClient>

// แถวกระเป๋า + ของในกระเป๋า ที่ closeEventCore select มา (items เป็น object เดียวต่อแถว)
type CloseKitContent = {
  quantity: number | null
  items: Pick<Item, 'id' | 'name' | 'serial_number' | 'status' | 'image_url' | 'is_consumable' | 'unit'> | null
}
type CloseKitRow = { id: string; name: string; kit_contents: CloseKitContent[] | null }

/** สถานะที่เลือกได้ตอนรับคืนอุปกรณ์ (ใช้ร่วมกับแท็บรับคืนในหน้าเช็คของ) */
const RETURN_STATUSES = ['available', 'damaged', 'maintenance', 'lost']

/** สถานะใบงานที่ถือว่าจบแล้ว — ตรงกับ POOL_DONE_STATUSES ใน jobs/tracking/tracking-logic.ts */
const POOL_FINISHED_STATUSES = ['done', 'skipped']

/** อุปกรณ์เดี่ยว (ไม่อยู่ในกระเป๋า) ของใบจัดของ — ลง snapshot ปิดงานเป็นกลุ่ม "อุปกรณ์เดี่ยว" */
export interface CloseLooseItem {
  itemId: string
  itemName: string
  serialNumber: string | null
  /** สภาพตอนคืนของ */
  status: string
}

/** id กลุ่มอุปกรณ์เดี่ยวใน kits_snapshot (ไม่มีคอลัมน์แยก — ใส่เป็นกลุ่มหนึ่งให้หน้าประวัติปิดงานแสดงได้ทันที) */
export const LOOSE_SNAPSHOT_KIT_ID = 'loose-items'
export const LOOSE_SNAPSHOT_KIT_NAME = 'อุปกรณ์เดี่ยว (ใบจัดของ)'

export interface CloseEventInput {
  eventId: string
  userId: string
  /** สถานะรับคืนของชิ้นในกระเป๋า (ไม่รวมวัสดุสิ้นเปลือง) — keepItemStatuses: true ใช้แค่ลง snapshot */
  itemStatuses: { itemId: string; status: string }[]
  imageUrls: string[]
  /** วัสดุสิ้นเปลืองที่ใช้ไปต่อ (กระเป๋า, ของ) — คู่ที่ตัดไปแล้ว (stock_movements) ถูกข้าม */
  consumableUse: { kitId: string; itemId: string; used: number }[]
  /** true = ไม่แตะ items.status (ใบจัดของ: ตั้งตอนคืนของ/คืนชั้นแล้ว) */
  keepItemStatuses: boolean
  /** อุปกรณ์เดี่ยวของใบจัดของ → snapshot */
  looseItems?: CloseLooseItem[]
}

/**
 * ใบงานหน้างานของงานที่ผูกอีเวนต์นี้จบเอง เมื่ออีเวนต์ถูกปิดจากการคืนกระเป๋า
 * — ไม่คืน error และไม่ throw ออกไป: การคืนกระเป๋าต้องสำเร็จอยู่ดีแม้ใบงานจะอัปเดตพลาด
 * — leadId ว่าง (อีเวนต์ที่ไม่ได้มาจากงาน CRM) → ข้ามเงียบๆ
 * — งานหนึ่งงานมีได้หลายอีเวนต์ (เช่น พรีเวดดิ้ง + วันงานจริง) แต่ใบงานหน้างานมีใบเดียวต่อทั้งงาน
 *   จึงปิดได้ต่อเมื่อ "ทุกอีเวนต์" ของงานนี้ปิดครบแล้ว ไม่ใช่แค่ใบที่เพิ่งคืนกระเป๋า
 *   (งานที่มีอีเวนต์เดียว = ใบที่เพิ่งปิดคือใบสุดท้ายอยู่แล้ว พฤติกรรมเหมือนเดิม)
 */
export async function autoFinishOnsiteJobs(supabase: Db, leadId: string | null, actorId: string) {
    if (!leadId) return

    const { data: leadEvents, error: eventsErr } = await supabase
        .from('events')
        .select('id, status')
        .eq('crm_lead_id', leadId)

    if (eventsErr) {
        console.error('[events] auto-finish onsite: fetch events failed:', eventsErr.message)
        return
    }
    // ยังมีอีเวนต์ที่ไม่ปิด → งานหน้างานยังไม่จบ (ไม่มีอีเวนต์เลย = ไม่ควรเกิด แต่ก็ไม่ปิดให้)
    if (!leadEvents || leadEvents.length === 0) return
    if (leadEvents.some(e => !isClosedEvent(e.status as string | null))) return

    const { data: jobs, error } = await supabase
        .from('jobs')
        .select('id, status')
        .eq('crm_lead_id', leadId)
        .eq('job_type', 'onsite')

    if (error) {
        console.error('[events] auto-finish onsite: fetch failed:', error.message)
        return
    }

    for (const job of jobs || []) {
        const oldStatus = (job.status as string) || ''
        if (POOL_FINISHED_STATUSES.includes(oldStatus)) continue

        const { error: updErr } = await supabase
            .from('jobs')
            .update({ status: 'done', updated_at: new Date().toISOString() })
            .eq('id', job.id)
        if (updErr) {
            console.error('[events] auto-finish onsite: update failed:', updErr.message)
            continue
        }

        // ไทม์ไลน์ของใบงาน (job_activities) แบบเดียวกับที่พูลงานบันทึกตอนรับ/คืน/ข้าม
        await supabase.from('job_activities').insert({
            job_id: job.id,
            created_by: actorId,
            activity_type: 'status_change',
            description: 'จบอัตโนมัติ: ปิดอีเวนต์แล้ว',
            old_status: oldStatus,
            new_status: 'done',
        })
        await logActivity('AUTO_FINISH_POOL_JOB', {
            jobId: job.id,
            jobType: 'onsite',
            leadId,
            oldStatus,
        })
        revalidatePath(`/jobs/${job.id}`)
    }

    revalidatePath('/jobs')
    revalidatePath('/jobs/tracking')
}

/**
 * ปิดอีเวนต์: ตรวจสถานะปิดแล้ว → กระเป๋าที่จอง (event_kits) → ตรวจ itemStatuses/วัสดุสิ้นเปลือง → ตัดยอด (planReturnUse + moveStock)
 * → snapshot (กระเป๋า + อุปกรณ์เดี่ยวถ้าส่ง) → event_closures → (ถ้า !keepItemStatuses) items.status → events.status = completed
 * → recomputeKitPointers → log CLOSE_EVENT → ใบงานหน้างานจบเอง → revalidate
 * ข้อความ error เหมือนหน้าปิดงานเดิมทุกข้อ · คืน { error } ไม่ throw
 */
export async function closeEventCore(supabase: Db, input: CloseEventInput): Promise<{ error: string } | { success: true }> {
     const { eventId, userId, itemStatuses, imageUrls, consumableUse, keepItemStatuses, looseItems } = input

     // Fetch event details before processing
     const { data: event } = await supabase
         .from('events')
         .select('*')
         .eq('id', eventId)
         .single()

     if (event?.status === 'completed') {
         return { error: 'อีเวนต์นี้ปิดงานไปแล้ว' }
     }

     // กระเป๋าของอีเวนต์นี้ = การจอง (event_kits)
     const bookedKitIds = (await loadBookingsForEvent(supabase, eventId)).map(b => b.kitId)
     const { data: kits } = bookedKitIds.length === 0 ? { data: [] } : await supabase
         .from('kits')
         .select(`
             id,
             name,
             kit_contents(
                 quantity,
                 items(id, name, serial_number, status, image_url, is_consumable, unit)
             )
         `)
         .in('id', bookedKitIds)
         .overrideTypes<CloseKitRow[], { merge: false }>()

     const contentsOf = (k: CloseKitRow) => (k.kit_contents || []).filter((kc): kc is CloseKitContent & { items: NonNullable<CloseKitContent['items']> } => !!kc.items?.id)
     // วัสดุสิ้นเปลืองไม่มีสถานะรับคืน — ใช้ไปเท่าไรตัดยอดผ่าน consumableUse
     const consumableIds = new Set(
         (kits || []).flatMap(k => contentsOf(k).filter(kc => kc.items.is_consumable).map(kc => kc.items.id as string))
     )
     if (itemStatuses.some(s => consumableIds.has(s.itemId))) {
         return { error: 'วัสดุสิ้นเปลืองไม่ต้องเลือกสถานะ — กรอกจำนวนที่ใช้ไปแทน' }
     }

     // รับคืนได้แค่ ใช้ได้ / เสียหาย / ซ่อมบำรุง / หาย และเฉพาะอุปกรณ์ปกติในกระเป๋าของงานนี้
     const allowedItemIds = new Set(
         (kits || []).flatMap(k => contentsOf(k).filter(kc => !kc.items.is_consumable).map(kc => kc.items.id as string))
     )
     if (itemStatuses.some(s => !RETURN_STATUSES.includes(s.status) || !allowedItemIds.has(s.itemId))) {
         return { error: 'สถานะอุปกรณ์ไม่ถูกต้อง — เลือกได้แค่ ใช้ได้ / เสียหาย / ซ่อมบำรุง / หาย' }
     }

     // วัสดุสิ้นเปลือง: ตัดยอดที่ใช้ไป "ก่อน" บันทึกปิดงาน — ล้มกลางทาง = ยังไม่ปิดงาน กดยืนยันซ้ำได้
     // คู่ (กระเป๋า, ของ) ที่งานนี้ตัดไปแล้วถูกข้าม จึงไม่ตัดซ้ำ
     const { data: usedRows } = await supabase
         .from('stock_movements')
         .select('kit_id, item_id, delta')
         .eq('event_id', eventId)
         .eq('reason', 'use')
     const alreadyCut = (usedRows || [])
         .filter(r => r.kit_id)
         .map(r => ({ kitId: r.kit_id as string, itemId: r.item_id, used: -r.delta }))
     const kitConsumables = (kits || []).flatMap(k =>
         contentsOf(k).filter(kc => kc.items.is_consumable).map(kc => ({ kitId: k.id, itemId: kc.items.id as string, name: kc.items.name as string }))
     )
     const plan = planReturnUse(kitConsumables, consumableUse, alreadyCut)
     if ('error' in plan) return { error: plan.error }

     for (const cut of plan.cuts) {
         const name = kitConsumables.find(c => c.kitId === cut.kitId && c.itemId === cut.itemId)?.name || 'วัสดุสิ้นเปลือง'
         const res = await moveStock(supabase, {
             itemId: cut.itemId,
             delta: -cut.used,
             reason: 'use',
             eventId,
             kitId: cut.kitId,
             userId,
             note: `ปิดงาน ${event?.name || ''}`.trim(),
         })
         if ('error' in res) return { error: `ตัดยอด ${name} ไม่สำเร็จ: ${res.error} — ยังไม่ได้ปิดงาน` }
         await logActivity('DRAW_STOCK', { itemId: cut.itemId, name, delta: -cut.used, balance: res.balance, eventId, kitId: cut.kitId })
     }
     if (plan.cuts.length > 0) {
         revalidatePath('/items')
         revalidatePath('/shelves')
         revalidatePath('/stock/dashboard')
     }
     // จำนวนใช้ไปจริงของงานนี้ต่อคู่: ที่ตัดไว้ก่อนหน้า > ที่ส่งมา > 0
     const usedFor = (kitId: string, itemId: string) =>
         alreadyCut.find(c => c.kitId === kitId && c.itemId === itemId)?.used
         ?? consumableUse.find(c => c.kitId === kitId && c.itemId === itemId)?.used
         ?? 0

     // Build kits snapshot
     const kitsSnapshot = kits?.map(kit => ({
         kitId: kit.id,
         kitName: kit.name,
         items: kit.kit_contents?.map((kc) => ({
             itemId: kc.items?.id,
             itemName: kc.items?.name,
             serialNumber: kc.items?.serial_number,
             status: itemStatuses.find(s => s.itemId === kc.items?.id)?.status || kc.items?.status,
             quantity: kc.quantity,
             imageUrl: kc.items?.image_url,
             ...(kc.items?.is_consumable ? { isConsumable: true, used: usedFor(kit.id, kc.items.id) } : {})
         })) || []
     })) || []
     // อุปกรณ์เดี่ยวของใบจัดของ = กลุ่มหนึ่งใน snapshot (หน้าประวัติปิดงานแสดงเป็น "กระเป๋า" ชื่อ อุปกรณ์เดี่ยว)
     const looseSnapshot = looseItems && looseItems.length > 0
         ? [{
             kitId: LOOSE_SNAPSHOT_KIT_ID,
             kitName: LOOSE_SNAPSHOT_KIT_NAME,
             isLoose: true,
             items: looseItems.map(i => ({ itemId: i.itemId, itemName: i.itemName, serialNumber: i.serialNumber, status: i.status, quantity: 1, imageUrl: null })),
         }]
         : []

     // 1. Save to event_closures table
     const { error: closureError } = await supabase
         .from('event_closures')
         .insert({
             event_name: event?.name || 'Unknown Event',
             event_date: event?.event_date,
             event_location: event?.location,
             closed_by: userId,
             kits_snapshot: [...kitsSnapshot, ...looseSnapshot],
             image_urls: imageUrls
         })

     if (closureError) {
         console.error('Failed to save closure record:', closureError)
         // Continue anyway - don't block the return process
     }

     // 2. Update item statuses (optimized batch update) — ใบจัดของไม่แตะ (ตั้งตอนคืนของ/คืนชั้น)
     if (!keepItemStatuses) {
         const statusGroups: Record<string, string[]> = {}
         for (const { itemId, status } of itemStatuses) {
             if (!statusGroups[status]) statusGroups[status] = []
             statusGroups[status].push(itemId)
         }

         await Promise.all(
             Object.entries(statusGroups).map(([status, ids]) =>
                 supabase.from('items').update({ status }).in('id', ids)
             )
         )
     }

     // 4. Soft-close the event — keep the row so event_staff / staff_checkins /
     //    job_cost_events links survive. Status flips to 'completed'.
     const { error } = await supabase
        .from('events')
        .update({ status: 'completed' })
        .eq('id', eventId)

     if (error) {
         console.error("Close event failed", error)
         return { error: 'ปิดงานไม่สำเร็จ' }
     }

     // 3. ปล่อยกระเป๋า — ชี้ไปงานถัดไปที่จองไว้ (ไม่มี = ว่าง) การจองของงานนี้เก็บไว้เป็นประวัติ
     await recomputeKitPointers(supabase, bookedKitIds)

     await logActivity('CLOSE_EVENT', {
         eventId,
         name: event?.name || 'Unknown Event',
         closureRecorded: !closureError
     }, undefined)

     // 5. ปิดอีเวนต์แล้ว → ใบงานหน้างานของงานที่ผูกอีเวนต์นี้จบเอง (หายจากแท็บหน้างาน)
     //    จงใจไม่ให้ล้มการคืนกระเป๋า: อีเวนต์ปิดสำเร็จไปแล้ว ใบงานพลาดก็แค่บันทึกไว้ใน console
     //    อีเวนต์ที่ไม่ได้ผูกกับงาน CRM (crm_lead_id ว่าง) ข้ามเงียบๆ
     try {
         await autoFinishOnsiteJobs(supabase, (event?.crm_lead_id as string) ?? null, userId)
     } catch (e) {
         console.error('[events] auto-finish onsite jobs threw:', e)
     }

     revalidatePath('/events')
     revalidatePath('/items')
     revalidatePath('/kits')
     revalidatePath('/events/event-closures')
     revalidatePath('/events/calendar')
     revalidatePath('/crm')

     return { success: true }
}
