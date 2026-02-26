'use server'

import { createServiceClient } from '@/lib/supabase-server'
import { cookies } from 'next/headers'
import type { Database } from '@/types'


/**
 * Cleanup orphaned items
 * Finds items with status 'in_use' that are not assigned to any active event
 * and resets their status to 'available'
 */
export async function cleanupOrphanedItems() {
    const cookieStore = await cookies()
    const userId = cookieStore.get('session_user_id')?.value
    
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const orphanedItemIds = items
        .filter(item => {
            // Check if item has no kit assignment OR kit has no event
            const kitContents = (item.kit_contents as any) || []
            return !kitContents.some((kc: any) => kc.kits?.event_id)
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
