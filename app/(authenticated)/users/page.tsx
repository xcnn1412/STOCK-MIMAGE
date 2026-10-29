import { supabaseServer as supabase } from '@/lib/supabase-server'
import { requireAuth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import UsersView from './users-view'

export const revalidate = 0

export default async function UserManagementPage() {
    const session = await requireAuth()
    const role = session?.role

    if (role !== 'admin') {
        redirect('/dashboard')
    }

    const { data: users } = await supabase
        .from('profiles')
        // เฉพาะคอลัมน์ที่ users-table ใช้ — ไม่ส่ง pin / active_session_id / ข้อมูลล็อกอินผิดไปเบราว์เซอร์ (รายงาน L4)
        .select('id, full_name, nickname, department, phone, role, is_approved, is_blocked, allowed_modules, national_id, address, bank_name, bank_account_number, account_holder_name, avatar_url')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })

    // Fetch latest login log for each user
    const usersWithLoginInfo = await Promise.all(
        (users || []).map(async (user) => {
            const { data: latestLogin } = await supabase
                .from('login_logs')
                .select('login_at')
                .eq('user_id', user.id)
                .order('login_at', { ascending: false })
                .limit(1)
                .single()

            return {
                ...user,
                allowed_modules: ((user as Record<string, unknown>).allowed_modules as string[] | null) || ['stock'],
                last_login_at: latestLogin?.login_at || null,
            }
        })
    )

    return (
        <UsersView users={usersWithLoginInfo} />
    )
}
