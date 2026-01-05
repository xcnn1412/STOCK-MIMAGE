import { supabase } from '@/lib/supabase'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import UsersView from './users-view'

export const revalidate = 0

export default async function UserManagementPage() {
    const cookieStore = await cookies()
    const role = cookieStore.get('session_role')?.value

    if (role !== 'admin') {
        redirect('/dashboard')
    }

    const { data: users } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false })

    return (
        <UsersView users={users || []} />
    )
}
