import { createServiceClient } from './supabase-server'
import { headers, cookies } from 'next/headers'
import { verifySessionToken } from './session'

export type ActionType =
    | 'LOGIN'
    | 'LOGOUT'
    | 'REGISTER'
    | 'APPROVE_USER'
    | 'REVOKE_USER'
    | 'BLOCK_USER'
    | 'UNBLOCK_USER'
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
    | 'CLOSE_EVENT'
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
    | 'UPDATE_LEAD_TRACKING'
    | 'UPLOAD_PAYMENT_PROOF'
    | 'DELETE_PAYMENT_PROOF'
    // Finance Module (เบิกเงิน)
    | 'CREATE_EXPENSE_CLAIM'
    | 'SUBMIT_EXPENSE_CLAIM'
    | 'CANCEL_EXPENSE_CLAIM'
    | 'APPROVE_EXPENSE_CLAIM'
    | 'APPROVE_EXPENSE_CLAIM_MONTH_END'
    | 'MARK_CLAIM_PENDING_MONTH_END'
    | 'MARK_CLAIM_WAITING_TAX_INVOICE'
    | 'REJECT_EXPENSE_CLAIM'
    | 'DELETE_EXPENSE_CLAIM'
    | 'MARK_CLAIM_PAID'
    | 'SETTLE_ADVANCE_CLAIM'
    | 'CONFIRM_REFUND_RECEIVED'
    | 'UPDATE_PETTY_CASH'
    | 'CLOSE_PETTY_CASH_PERIOD'
    | 'LINK_CLAIM_TO_PETTY_CASH'
    | 'UNLINK_CLAIM_FROM_PETTY_CASH'
    // WORLDCUP 2026 (temporary) — remove after the tournament
    | 'WORLDCUP_PICK'
    | 'ADMIN_OVERRIDE_CLAIM_STATUS'
    // Security Module
    | 'ACCOUNT_LOCKED'
    | 'ACCOUNT_UNLOCKED'
    | 'LOGIN_BLOCKED_IP'
    | 'IP_RULE_CREATED'
    | 'IP_RULE_DELETED'
    | 'SESSION_TIMEOUT'
    // Jobs Module
    | 'CREATE_JOB'
    | 'UPDATE_JOB'
    | 'DELETE_JOB'
    | 'UPDATE_JOB_STATUS'
    | 'ARCHIVE_JOB'
    | 'UNARCHIVE_JOB'
    | 'CREATE_JOB_ACTIVITY'
    | 'CREATE_JOB_SETTING'
    | 'UPDATE_JOB_SETTING'
    | 'DELETE_JOB_SETTING'
    | 'CREATE_JOBS_FROM_LEAD'
    | 'UPDATE_JOB_TAGS'
    // Ticket Module
    | 'CREATE_TICKET'
    | 'UPDATE_TICKET_STATUS'
    | 'CREATE_TICKET_REPLY'
    | 'DELETE_TICKET'
    | 'ARCHIVE_TICKET'
    | 'UNARCHIVE_TICKET'
    // Content Planner Module
    | 'CREATE_CONTENT_POST'
    | 'UPDATE_CONTENT_POST'
    | 'DELETE_CONTENT_POST'
    | 'DELETE_CONTENT_POSTS'
    | 'IMPORT_CONTENT_POSTS'
    // Event ↔ CRM Linking
    | 'LINK_EVENT_TO_CRM'
    | 'UNLINK_EVENT_FROM_CRM'
    // Cost ↔ CRM Sync
    | 'SYNC_REVENUE_FROM_CRM'
    | 'LINK_COST_EVENT_TO_CRM'
    | 'UNLINK_COST_EVENT_FROM_CRM'
    // Documents
    | 'CREATE_DOCUMENT'
    | 'UPDATE_DOCUMENT'
    | 'DELETE_DOCUMENT'
    | 'SUBMIT_DOCUMENT'
    | 'APPROVE_DOCUMENT'
    | 'REJECT_DOCUMENT'
    | 'ISSUE_DOCUMENT_NUMBER'
    | 'VOID_DOCUMENT'
    | 'MARK_DOCUMENT_SENT'
    | 'CLOSE_DOCUMENT'
    | 'CREATE_DOC_BRAND'
    | 'UPDATE_DOC_BRAND'
    | 'UPDATE_DOC_COUNTER'
    | 'UPDATE_DOC_TEMPLATE'
    | 'UPDATE_SIGNATURE'
    // Salary (เงินเดือน)
    | 'UPDATE_SALARY_SETTINGS'
    | 'UPDATE_SALARY_DUTY'
    | 'UPDATE_SALARY_PROFILE'
    | 'CREATE_SALARY_RUN'
    | 'COMPUTE_SALARY_SLIP'
    | 'OVERRIDE_SALARY_LINE'
    | 'FINALIZE_SALARY_SLIP'
    | 'MARK_SALARY_PAID'
    | 'SALARY_MARK_ALL_PAID'
    | 'SYNC_SALARY_TO_COSTS'
    | 'DELETE_SALARY_SLIP'
    | 'UPDATE_CHECKIN_DUTIES'
    | 'UPDATE_CHECKIN_LOCATION'
    // User Profile
    | 'UPDATE_USER_PROFILE'
    | 'UPDATE_MY_PROFILE'
    | 'CHANGE_PIN'

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
