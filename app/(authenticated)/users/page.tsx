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

    // Fetch latest login log for each user (including selfie)
    const usersWithLoginInfo = await Promise.all(
        (users || []).map(async (user) => {
            const { data: latestLogin } = await supabase
                .from('login_logs')
                .select('selfie_url, login_at')
                .eq('user_id', user.id)
                .order('login_at', { ascending: false })
                .limit(1)
                .single()

            // Generate public URL for selfie if exists
            let selfiePublicUrl = null
            if (latestLogin?.selfie_url) {
                const { data: urlData } = supabase.storage
                    .from('login_selfies')
                    .getPublicUrl(latestLogin.selfie_url)
                selfiePublicUrl = urlData?.publicUrl
            }

            return {
                ...user,
                allowed_modules: ((user as Record<string, unknown>).allowed_modules as string[] | null) || ['stock'],
                last_login_at: latestLogin?.login_at || null,
                last_login_selfie_url: selfiePublicUrl
            }
        })
    )

    return (
        <UsersView users={usersWithLoginInfo} />
    )
}
