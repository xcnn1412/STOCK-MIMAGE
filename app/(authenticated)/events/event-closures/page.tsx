import { supabaseServer as supabase } from '@/lib/supabase-server'
import { requireAuth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import EventClosuresView from './event-closures-view'

import type { EventClosure } from '@/types'

export const revalidate = 0

export default async function EventClosuresPage() {
    const session = await requireAuth()

    // Allow any authenticated user to view closures
    if (!session) {
        redirect('/login')
    }

    const { data: closures, error } = await supabase
        .from('event_closures')
        .select(`
            *,
            closer:profiles!event_closures_closed_by_fkey(id, full_name)
        `)
        .order('closed_at', { ascending: false })

    return (
        <EventClosuresView closures={(closures || []) as unknown as EventClosure[]} error={error ? error.message : null} />
    )
}
