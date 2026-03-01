import { createServiceClient } from './supabase-server'
import { headers, cookies } from 'next/headers'
import { verifySessionToken } from './session'

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
    // Finance Module (เบิกเงิน)
    | 'CREATE_EXPENSE_CLAIM'
    | 'APPROVE_EXPENSE_CLAIM'
    | 'REJECT_EXPENSE_CLAIM'
    | 'DELETE_EXPENSE_CLAIM'
    // Security Module
    | 'ACCOUNT_LOCKED'
    | 'ACCOUNT_UNLOCKED'
    | 'LOGIN_BLOCKED_IP'
    | 'IP_RULE_CREATED'
    | 'IP_RULE_DELETED'
    | 'SESSION_TIMEOUT'

export async function logActivity(
    action: ActionType,
    details: any = {},
    targetUserId?: string,
    overrideUserId?: string // For login/register (when cookie isn't set/ready yet)
) {
    try {
        const supabase = createServiceClient()
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

        // Determine Actor — use signed token first, fallback to legacy cookie
        let userId = overrideUserId
        if (!userId) {
            const cookieStore = await cookies()
            const token = cookieStore.get('session_token')?.value
            if (token) {
                const verified = verifySessionToken(token)
                if (verified) userId = verified.userId
            }
            // Fallback to legacy cookie
            if (!userId) {
                userId = cookieStore.get('session_user_id')?.value
            }
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
