'use server'

import { createServiceClient } from '@/lib/supabase-server'
import { revalidatePath } from 'next/cache'
import { logActivity } from '@/lib/logger'
import { cookies } from 'next/headers'
import { Database } from '@/types/database.types'


export async function cleanupOldClosures() {
    const cookieStore = await cookies()
    const userId = cookieStore.get('session_user_id')?.value
    if (!userId) {
        return { error: 'Unauthorized' }
    }

    const supabase = createServiceClient()
    
    // Calculate cutoff date (60 days ago)
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - 60)
    const cutoffISO = cutoffDate.toISOString()

    // 1. Get closures to be deleted to clean up images
    const { data: oldClosures, error: fetchError } = await supabase
        .from('event_closures')
        .select('id, image_urls, event_name')
        .lt('closed_at', cutoffISO)

    if (fetchError) {
        console.error('Error fetching old closures:', fetchError)
        return { error: 'Failed to fetch old records' }
    }

    if (!oldClosures || oldClosures.length === 0) {
        return { success: true, count: 0 }
    }

    // 2. Cleanup Storage
    const allImageUrls = (oldClosures as any[]).flatMap(c => c.image_urls || [])
    if (allImageUrls.length > 0) {
        // Extract paths from URLs
        // URL format: .../storage/v1/object/public/event_closures/folder/file.jpg
        // We need 'folder/file.jpg'
        const paths = allImageUrls.map(url => {
            try {
                const urlObj = new URL(url)
                const pathParts = urlObj.pathname.split('/event_closures/')
                return pathParts[1]
            } catch (e) {
                return null
            }
        }).filter(Boolean) as string[]

        if (paths.length > 0) {
            const { error: storageError } = await supabase.storage
                .from('event_closures')
                .remove(paths)
            
            if (storageError) {
                console.error('Error cleaning up storage:', storageError)
                // Continue with DB deletion even if storage fails? Yes, to keep DB clean.
            }
        }
    }

    // 3. Delete from DB
    const { error: deleteError } = await supabase
        .from('event_closures')
        .delete()
        .lt('closed_at', cutoffISO)

    if (deleteError) {
        console.error('Error deleting closures:', deleteError)
        return { error: 'Failed to delete records' }
    }

    // Log activity
    await logActivity('CLEANUP_CLOSURES', {
        count: oldClosures.length,
        cutoffDate: cutoffISO,
        details: `Deleted ${oldClosures.length} closures older than 60 days`
    }, undefined)

    revalidatePath('/events/event-closures')
    return { success: true, count: oldClosures.length }
}
