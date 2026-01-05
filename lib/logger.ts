import { createClient } from '@supabase/supabase-js'
import { headers, cookies } from 'next/headers'

// Use a separate client for logging that uses the service role or at least has insert permissions
// Since we don't have SERVICE_KEY in the env vars checked previously (only ANON), 
// we assume ANON key + proper RLS or public table helper.
// However, seeing `files` list, I didn't see SERVICE_ROLE_KEY.
// Let's stick to the pattern in `app/login/actions.ts`: createClient with ANON key.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

function getSupabase() {
    return createClient(supabaseUrl, supabaseKey, {
        auth: { persistSession: false }
    })
}

export type ActionType = 
    | 'LOGIN' 
    | 'LOGOUT' 
    | 'REGISTER' 
    | 'APPROVE_USER' 
    | 'REVOKE_USER'
    | 'UPDATE_ROLE' 
    | 'DELETE_USER'
    | 'CREATE_ITEM'
    | 'UPDATE_ITEM'
    | 'DELETE_ITEM'
    | 'CREATE_KIT'
    | 'UPDATE_KIT'
    | 'DELETE_KIT'
    | 'ADD_KIT_ITEM'
    | 'REMOVE_KIT_ITEM'
    | 'UPDATE_KIT_ITEM'
    | 'CREATE_EVENT'
    | 'UPDATE_EVENT'
    | 'DELETE_EVENT'

export async function logActivity(
    action: ActionType,
    details: any = {},
    targetUserId?: string,
    overrideUserId?: string // For login/register (when cookie isn't set/ready yet)
) {
    try {
        const supabase = getSupabase()
        const headersList = await headers()
        const ip = headersList.get('x-forwarded-for') || 'unknown'
        const userAgent = headersList.get('user-agent') || 'unknown'
        
        // Determine Actor
        let userId = overrideUserId
        if (!userId) {
            const cookieStore = await cookies()
            userId = cookieStore.get('session_user_id')?.value
        }

        if (!userId) {
            console.warn('Logging activity without user_id', action)
            // Still log it, maybe as system or anonymous?
        }

        await supabase.from('activity_logs').insert({
            user_id: userId || null,
            action_type: action,
            target_user_id: targetUserId || null,
            details,
            ip_address: ip,
            user_agent: userAgent
        })

    } catch (error) {
        console.error('Failed to log activity:', error)
        // Don't crash the app if logging fails
    }
}
