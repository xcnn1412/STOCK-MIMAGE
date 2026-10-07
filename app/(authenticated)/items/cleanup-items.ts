'use server'

import { createServiceClient } from '@/lib/supabase-server'
import { requireAuth } from '@/lib/auth'
import { readAllRows } from '@/lib/read-all-rows'

/** สถานะใบจัดของที่ยังไม่คืนชั้น — หน่วยในใบเหล่านี้ยังออกงานอยู่จริง ห้ามรีเซ็ต */
const OPEN_PACKING_STATUSES = ['selecting', 'picking', 'ready', 'out', 'returned']

/**
 * id อุปกรณ์ที่อยู่ในใบจัดของที่ยังไม่คืนชั้น (บรรทัดอุปกรณ์เดี่ยว + ของในกระเป๋าของบรรทัดกระเป๋า)
 * ยังไม่รัน migration 20261012 (ไม่มีตาราง) = ว่าง · อ่านพังอย่างอื่น = throw (ไม่รีเซ็ตอะไรเลยดีกว่ารีเซ็ตผิด)
 */
async function itemIdsInOpenPackingLists(supabase: ReturnType<typeof createServiceClient>): Promise<Set<string>> {
    const lists = await readAllRows<{ id: string }>((from, to) =>
        supabase.from('packing_lists').select('id').in('status', OPEN_PACKING_STATUSES).order('created_at').order('id').range(from, to)
    )
    if (lists.error) {
        if (lists.error.code === '42P01' || lists.error.code === 'PGRST205') return new Set()
        throw new Error(lists.error.message)
    }
    if (lists.rows.length === 0) return new Set()
    const lines = await readAllRows<{ item_id: string | null; kit_id: string | null }>((from, to) =>
        supabase.from('packing_list_items').select('item_id, kit_id').in('list_id', lists.rows.map(l => l.id)).order('created_at').order('id').range(from, to)
    )
    if (lines.error) throw new Error(lines.error.message)
    const out = new Set(lines.rows.flatMap(l => (l.item_id ? [l.item_id] : [])))
    const kitIds = [...new Set(lines.rows.flatMap(l => (l.kit_id ? [l.kit_id] : [])))]
    if (kitIds.length > 0) {
        const contents = await readAllRows<{ item_id: string }>((from, to) =>
            supabase.from('kit_contents').select('item_id').in('kit_id', kitIds).order('id').range(from, to)
        )
        if (contents.error) throw new Error(contents.error.message)
        for (const c of contents.rows) out.add(c.item_id)
    }
    return out
}


/**
 * Cleanup orphaned items
 * Finds items with status 'in_use' that are not assigned to any active event
 * and resets their status to 'available'
 */
export async function cleanupOrphanedItems() {
    const session = await requireAuth()
    const userId = session?.userId
    
    if (!userId) {
        return { error: 'Unauthorized: No active session found' }
    }
    
    const supabase = createServiceClient()
    
    // 1. Fetch all items with status 'in_use'
    const { data: items, error: fetchError } = await supabase
        .from('items')
        .select(`
            id,
            name,
            status,
            kit_contents(
                kit_id,
                kits(event_id, name)
            )
        `)
        .eq('status', 'in_use')
    
    if (fetchError) {
        return { error: fetchError.message }
    }
    
    if (!items || items.length === 0) {
        return { 
            success: true, 
            count: 0, 
            message: 'ไม่พบอุปกรณ์ที่ต้องแก้ไข' 
        }
    }
    
    // 2. Filter items that are orphaned (not in any active event)
    // อุปกรณ์ในใบจัดของที่ยังไม่คืนชั้นไม่ใช่ของหลงทาง (หยิบแล้ว = in_use ตั้งแต่ก่อนวันงาน) — ข้ามเสมอ
    let packed: Set<string>
    try {
        packed = await itemIdsInOpenPackingLists(supabase)
    } catch (e) {
        return { error: `ตรวจใบจัดของไม่สำเร็จ: ${(e as Error).message}` }
    }
    type KitLink = { kits?: { event_id: string | null } | null }
    const orphanedItemIds = items
        .filter(item => !packed.has(item.id))
        .filter(item => {
            // Check if item has no kit assignment OR kit has no event
            const kitContents = ((item.kit_contents as unknown) as KitLink[] | null) || []
            return !kitContents.some(kc => kc.kits?.event_id)
        })
        .map(item => item.id)
    
    if (orphanedItemIds.length === 0) {
        return { 
            success: true, 
            count: 0, 
            message: 'ไม่พบอุปกรณ์ที่ต้องแก้ไข - ทุกอุปกรณ์อยู่ใน Event ที่กำลังดำเนินการ' 
        }
    }
    
    // 3. Reset orphaned items to 'available'
    const { error: updateError } = await supabase
        .from('items')
        .update({ status: 'available' })
        .in('id', orphanedItemIds)
    
    if (updateError) {
        return { error: updateError.message }
    }
    
    return { 
        success: true, 
        count: orphanedItemIds.length,
        message: `แก้ไขเรียบร้อย: รีเซ็ตสถานะอุปกรณ์ ${orphanedItemIds.length} รายการเป็น "พร้อมใช้งาน"`,
        itemIds: orphanedItemIds
    }
}
