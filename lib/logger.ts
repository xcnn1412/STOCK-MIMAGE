import { createClient } from '@supabase/supabase-js'
import { headers, cookies } from 'next/headers'
// import geoip from 'geoip-lite' // Removed to fix serverless deployment issues

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
    | 'CREATE_TEMPLATE'
    | 'UPDATE_TEMPLATE'
    | 'DELETE_TEMPLATE'
    | 'ADD_TEMPLATE_ITEM'
    | 'REMOVE_TEMPLATE_ITEM'
    | 'UPDATE_TEMPLATE_STATUS'
    | 'CLEANUP_CLOSURES'
    | 'UPDATE_MODULES'
    | 'CREATE_KPI_TEMPLATE'
    | 'UPDATE_KPI_TEMPLATE'
    | 'DELETE_KPI_TEMPLATE'
    | 'CREATE_KPI_ASSIGNMENT'
    | 'UPDATE_KPI_ASSIGNMENT'
    | 'DELETE_KPI_ASSIGNMENT'
    | 'SUBMIT_KPI_EVALUATION'
    | 'UPDATE_KPI_EVALUATION'
    | 'DELETE_KPI_EVALUATION'
    | 'DELETE_ALL_KPI_EVALUATIONS'
    | 'SUBMIT_SELF_EVALUATION'
    // Cost Module
    | 'IMPORT_EVENT_TO_COSTS'
    | 'IMPORT_CLOSURE_TO_COSTS'
    | 'CREATE_JOB_EVENT_MANUAL'
    | 'UPDATE_JOB_EVENT'
    | 'DELETE_JOB_EVENT'
    | 'CREATE_COST_ITEM'
    | 'UPDATE_COST_ITEM'
    | 'DELETE_COST_ITEM'
    // CRM Module
    | 'CREATE_CRM_LEAD'
    | 'UPDATE_CRM_LEAD'
    | 'DELETE_CRM_LEAD'
    | 'UPDATE_CRM_STATUS'
    | 'CREATE_CRM_ACTIVITY'
    | 'CREATE_EVENT_FROM_CRM'
    | 'CREATE_CRM_SETTING'
    | 'UPDATE_CRM_SETTING'
    | 'DELETE_CRM_SETTING'
    | 'ARCHIVE_CRM_LEAD'
    | 'UNARCHIVE_CRM_LEAD'

export async function logActivity(
    action: ActionType,
    details: any = {},
    targetUserId?: string,
    overrideUserId?: string // For login/register (when cookie isn't set/ready yet)
) {
    try {
        const supabase = getSupabase()
        const headersList = await headers()
        let ip = headersList.get('x-forwarded-for') || 'unknown'

        // Handle multiple IPs (e.g. "1.2.3.4, 5.6.7.8")
        if (ip.includes(',')) {
            ip = ip.split(',')[0].trim()
        }

        const userAgent = headersList.get('user-agent') || 'unknown'

        // GeoIP Lookup - Temporarily removed due to serverless deployment issues
        let latitude: number | null = null
        let longitude: number | null = null
        let location: string | null = null

        /* 
        if (ip && ip !== 'unknown' && ip !== '::1' && ip !== '127.0.0.1') {
           // ...
        } 
        */

        // Try to get location from various headers (Vercel, Cloudflare, etc.)
        const city = headersList.get('x-vercel-ip-city') || headersList.get('cf-ipcity') || headersList.get('x-geo-city')
        const country = headersList.get('x-vercel-ip-country') || headersList.get('cf-ipcountry') || headersList.get('x-geo-country')

        if (city && country) {
            location = `${city}, ${country}`
            // Some providers might give lat/long headers too (e.g. x-vercel-ip-latitude), but city/country is often enough for reading.
            const latHeader = headersList.get('x-vercel-ip-latitude') || headersList.get('cf-iplatitude')
            const longHeader = headersList.get('x-vercel-ip-longitude') || headersList.get('cf-iplongitude')
            if (latHeader && longHeader) {
                latitude = parseFloat(latHeader)
                longitude = parseFloat(longHeader)
            }
        } else if (ip === '::1' || ip === '127.0.0.1') {
            location = 'Localhost'
        }

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
            user_agent: userAgent,
            location,
            latitude,
            longitude
        })

    } catch (error) {
        console.error('Failed to log activity:', error)
        // Don't crash the app if logging fails
    }
}
