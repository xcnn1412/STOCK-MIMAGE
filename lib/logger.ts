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
    | 'ASSIGN_EVENT_STAFF'
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
    | 'REOPEN_REJECTED_CLAIM'
    | 'DELETE_EXPENSE_CLAIM'
    | 'MARK_CLAIM_PAID'
    | 'SETTLE_ADVANCE_CLAIM'
    | 'CONFIRM_REFUND_RECEIVED'
    | 'UPDATE_PETTY_CASH'
    | 'CLOSE_PETTY_CASH_PERIOD'
    | 'LINK_CLAIM_TO_PETTY_CASH'
    | 'UNLINK_CLAIM_FROM_PETTY_CASH'
    // คิวใบเบิก (ขั้น 4) — ส่งกลับให้แก้ (กลับเป็นแบบร่างพร้อมเหตุผล) · ซ่อนแทนการลบ / กู้คืน
    | 'SEND_BACK_EXPENSE_CLAIM'
    | 'HIDE_EXPENSE_CLAIM'
    | 'RESTORE_EXPENSE_CLAIM'
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
    | 'AUTO_CREATE_JOBS_FROM_LEAD'
    // เปิดใบงานกราฟิกเองจากการ์ด CRM (ตอบรับแล้วระบบสร้างเฉพาะใบงานหน้างาน)
    | 'OPEN_GRAPHIC_JOB'
    | 'UPDATE_JOB_TAGS'
    // พูลงาน — รับ/คืน/ข้าม/เปลี่ยนคนรับใบงาน
    | 'CLAIM_POOL_JOB'
    | 'RELEASE_POOL_JOB'
    | 'SKIP_POOL_JOB'
    | 'REASSIGN_POOL_JOB'
    // แอดมิน/ฝ่ายประสานงาน assign ใบงานให้คนที่เลือกโดยตรง (เพิ่มคนรับผิดชอบ)
    | 'ASSIGN_POOL_JOB'
    // กดเสร็จสิ้นคำเตือน "หน้าที่ยังไม่ครบ" ของงานที่เลยวันงานแล้ว (dashboard-alerts)
    | 'CLOSE_PREP_WARNING'
    // อัปโหลด/ลบรูปโปรไฟล์ (profiles.avatar_url)
    | 'UPDATE_AVATAR'
    // หน้าที่เตรียมงาน — รับ/คืนรายหน้าที่ (จัดคน / จัดรถ / จัดกระเป๋า)
    | 'CLAIM_LEAD_DUTY'
    | 'RELEASE_LEAD_DUTY'
    | 'WAIVE_LEAD_DUTY'
    | 'UNWAIVE_LEAD_DUTY'
    // แก้สถานะออกแบบของใบงานกราฟิกใบเดียว (jobs.design_status — งานหนึ่งมีหลายใบ)
    | 'UPDATE_JOB_DESIGN_STATUS'
    // ใบงานจบเอง — กราฟิก (design_status พร้อม) / หน้างาน (ปิดอีเวนต์จากการคืนกระเป๋า)
    | 'AUTO_FINISH_POOL_JOB'
    // ใบงานหน้างานขยับเป็น "ออกหน้างาน" เอง เมื่อทีมเช็คอินหน้างานของอีเวนต์ที่ผูกงานนั้น
    | 'AUTO_ONSITE_POOL_JOB'
    // จองกระเป๋าให้อีเวนต์ / ยกเลิกจอง / จัดกระเป๋าครบ (event_kits — ADR-0003)
    | 'BOOK_EVENT_KIT'
    | 'UNBOOK_EVENT_KIT'
    | 'PACK_EVENT_KIT'
    // จัดรถให้อีเวนต์ของงาน (event_vehicles — ADR-0004)
    | 'ASSIGN_EVENT_VEHICLE'
    // ตั้งค่าทีมของพูลงาน — แผนกไหนรับใบงานประเภทไหน / แผนกไหนจอง-ย้ายกระเป๋าได้
    | 'UPDATE_POOL_TEAM_SETTINGS'
    // จัดซื้อ (/jobs/purchasing) — เช็กลิสต์ / รายการ (รวมรูปแนบ) / ชุดสำเร็จรูป
    | 'CREATE_PURCHASE_LIST'
    | 'UPDATE_PURCHASE_LIST'
    | 'DELETE_PURCHASE_LIST'
    | 'CREATE_PURCHASE_ITEM'
    | 'UPDATE_PURCHASE_ITEM'
    | 'UPDATE_PURCHASE_ITEM_STATUS'
    | 'DELETE_PURCHASE_ITEM'
    | 'SAVE_PURCHASE_TEMPLATE'
    | 'DELETE_PURCHASE_TEMPLATE'
    // จัดซื้อ ↔ ใบเบิก — ผูก/เลิกผูกรายการจัดซื้อกับ expense_claims (purchase_items.expense_claim_id)
    | 'LINK_PURCHASE_ITEM_CLAIM'
    | 'UNLINK_PURCHASE_ITEM_CLAIM'
    // จับชุดเอกสารใบเบิก — ส่งออก PDF ชุดพิมพ์ (มีเลขบัญชี จึงต้องมีประวัติ) และเครื่องหมายเข้าแฟ้ม
    | 'EXPORT_CLAIM_BUNDLE'
    | 'MARK_CLAIM_FILED'
    | 'UNMARK_CLAIM_FILED'
    // ดูบัญชีธนาคารของพนักงานคนอื่นเพื่อกรอกเป็นผู้รับเงินในใบเบิก (คนที่ไม่ใช่แอดมินได้ทีละคน มีประวัติทุกครั้ง)
    | 'VIEW_STAFF_BANK_DETAILS'
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
    | 'UPLOAD_DOCUMENT_FILE'
    | 'CREATE_DOC_BRAND'
    | 'UPDATE_DOC_BRAND'
    | 'UPDATE_DOC_COUNTER'
    | 'UPDATE_DOC_TEMPLATE'
    | 'UPDATE_SIGNATURE'
    | 'UPDATE_EVENT_MANAGERS'
    // ชั้นเก็บของ
    | 'CREATE_SHELF'
    | 'UPDATE_SHELF'
    | 'DELETE_SHELF'
    | 'MOVE_TO_SHELF'
    | 'AUDIT_SHELF'
    | 'CREATE_SHELF_ROOM'
    | 'UPDATE_SHELF_ROOM'
    | 'DELETE_SHELF_ROOM'
    | 'CREATE_SHELF_RACK'
    | 'UPDATE_SHELF_RACK'
    | 'DELETE_SHELF_RACK'
    // วัสดุสิ้นเปลือง
    | 'RESTOCK_ITEM'
    | 'DRAW_STOCK'
    | 'DISCARD_STOCK'
    | 'ADJUST_STOCK'
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
    | 'REOPEN_SALARY_SLIP'
    | 'ACCEPT_SALARY_WARNING'
    | 'UNACCEPT_SALARY_WARNING'
    | 'SET_RUNNER_AMOUNTS'
    | 'ADD_SALARY_CHECKIN'
    | 'EDIT_SALARY_CHECKIN'
    | 'UPDATE_CHECKIN_DUTIES'
    | 'UPDATE_CHECKIN_LOCATION'
    // Sales Board — เป้าค่าคอมแอดมิน
    | 'UPDATE_COMMISSION_TARGET'
    // User Profile
    | 'UPDATE_USER_PROFILE'
    | 'UPDATE_MY_PROFILE'
    | 'CHANGE_PIN'
    // MCP — Claude อ่านข้อมูลแทนพนักงาน: อนุญาตเชื่อมต่อ / ยกเลิกการเชื่อมต่อ / เรียก tool
    | 'MCP_CONNECT'
    | 'MCP_REVOKE'
    | 'MCP_TOOL_CALL'

export async function logActivity(
    action: ActionType,
    details: unknown = {},
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

        // Determine Actor — signed token only (unsigned legacy cookies are ignored).
        // Kept DB-free on purpose — authorization is the caller's job (requireAuth()).
        let userId = overrideUserId
        if (!userId) {
            const cookieStore = await cookies()
            const token = cookieStore.get('session_token')?.value
            if (token) {
                const verified = verifySessionToken(token)
                if (verified) userId = verified.userId
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
