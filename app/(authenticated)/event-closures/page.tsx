import { supabase } from '@/lib/supabase'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import EventClosuresView from './event-closures-view'

export const revalidate = 0

export default async function EventClosuresPage() {
    const cookieStore = await cookies()
    const role = cookieStore.get('session_role')?.value

    // Allow any authenticated user to view closures
    if (!role) {
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
        <EventClosuresView closures={closures || []} error={error ? error.message : null} />
    )
}
