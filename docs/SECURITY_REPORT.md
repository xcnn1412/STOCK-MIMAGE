# Security Vulnerability Scan Report

## Executive Summary

A security review was conducted on the codebase, specifically focusing on authentication, authorization, and data integrity. The following critical vulnerabilities were identified.

## 1. Missing Authentication Checks in Server Actions (Critical)

**Location:** `app/(authenticated)/items/[id]/actions.ts` (and potentially others)
**Description:**
The server actions `updateItem` and `deleteItem` do not explicitly verify that the request is initiated by an authenticated user. They rely on the `createClient` using the `ANON_KEY`. If Row Level Security (RLS) is not strictly configured on the `items` table to deny anonymous writes, **any unauthenticated user** (or attacker) could theoretically call these endpoints to modify or delete data.

**Recommendation:**
Add an explicit session check at the beginning of every Server Action that performs mutation.

```typescript
import { cookies } from 'next/headers'

export async function updateItem(...) {
    const cookieStore = await cookies()
    const userId = cookieStore.get('session_user_id')?.value
    if (!userId) {
        throw new Error("Unauthorized: No active session")
    }
    // Proceed...
}
```

## 2. Weak Middleware Authentication (Medium)

**Location:** `middleware.ts`
**Description:**
The application middleware protects routes by checking for the _existence_ of a `session_user_id` cookie.

```typescript
const userId = request.cookies.get("session_user_id")?.value;
```

It does not verify if this cookie is valid, signed, or corresponds to an active session in the database. A malicious actor could manually create a cookie named `session_user_id` with any value and bypass the routing protection to view protected pages (though data fetching might still be blocked if RLS is correct).

**Recommendation:**
Enhance the middleware to verify the session token, or ensure that all data fetching functions (Server Components) perform a secondary validation of the user's identity before returning sensitive data.

## 3. Potential RLS Misconfiguration (Low - Verification Needed)

**Description:**
Since the code uses `ANON_KEY` for database interactions, the security of the application relies entirely on Supabase's Row Level Security (RLS). If RLS policies are "public" or disabled for the `items`, `kits`, or `profiles` tables, the system is wide open.

**Recommendation:**
Audit Supabase SQL policies to ensure that `INSERT`, `UPDATE`, and `DELETE` operations are restricted to authenticated users matching specific roles (e.g., `admin`).

## 4. IP-Based Location Reliance (Info)

**Location:** `lib/logger.ts`
**Description:**
The system now relies on Headers (`x-vercel-ip-city`, etc.) for location logging. While standard for cloud deployments, these headers can sometimes be spoofed if the application is not behind a trusted proxy. This isn't critical for logic but affects audit log integrity.

---

**Next Steps:**

1. Patch all Server Actions to include session existence checks.
2. Review Supabase RLS policies.

---

## 2026-09-29 — แก้ช่องโหว่ระบบแจ้งเตือนและไฟล์แนบ Ticket (v1.22.0)

### แก้แล้ว

| จุด | ปัญหา | การแก้ |
|---|---|---|
| `lib/notifications.ts` | ไฟล์ประกาศเป็น server action ทั้งไฟล์ `createNotifications` จึงเป็นปลายทางที่ยิงผ่านเครือข่ายได้โดยไม่ตรวจการล็อกอิน สร้างแจ้งเตือนให้ใครก็ได้ในนามใครก็ได้ | ถอดการประกาศออก เหลือเป็นตัวช่วยฝั่งเซิร์ฟเวอร์ ผู้เรียกทั้ง 7 ไฟล์เป็น server action ที่ตรวจการล็อกอินเอง |
| `uploadTicketAttachments` / `deleteTicketAttachment` | ระบุตัวผู้ใช้จาก cookie `session_user_id` ที่ไม่ได้เซ็น · ลบไฟล์ใดก็ได้ในบัคเก็ต · โฟลเดอร์และนามสกุลไฟล์มาจาก client ตรงๆ | ใช้ `requireAuth()` · ไฟล์ใหม่เก็บที่ `<โฟลเดอร์>/u-<ผู้อัปโหลด>/<ไฟล์>` ลบได้เฉพาะไฟล์ของตัวเอง (แอดมินลบได้ทุกไฟล์) · โฟลเดอร์ถูกคัดกรอง · นามสกุลมาจากชนิดไฟล์ · ครั้งละไม่เกิน 10 ไฟล์ |
| policy `ticket_attachments_all` บน `storage.objects` | FOR ALL ไม่ระบุ role — ใครถือ anon key (อยู่ในเบราว์เซอร์ทุกเครื่อง) อัปโหลด เขียนทับ ลบ และไล่รายชื่อไฟล์ในบัคเก็ตได้ตรงๆ | migration `20260929_ticket_attachments_lockdown.sql` ลบ policy ทิ้ง — **ต้องรันบน production** การเปิดดูไฟล์ด้วยลิงก์ไม่กระทบ |

ตรวจด้วย `npx tsx scripts/ticket-attachments.check.ts` (รัน action จริงกับฐานข้อมูลจำลอง) และทดสอบ migration กับ postgres 17 ในเครื่อง: ก่อนรัน anon ลบไฟล์ได้ หลังรันทำไม่ได้ ส่วน service role ยังทำได้

ข้อจำกัดที่รู้: ไฟล์ที่อัปโหลดก่อนการแก้นี้ไม่มีท่อน `u-<id>` ใน path จึงลบผ่าน action นี้ได้เฉพาะแอดมิน

### ยังเปิดอยู่ — เรียงตามความเสี่ยง

1. **cookie ที่ไม่ได้เซ็นถูกเชื่อในราว 20 โมดูล** — ตัวช่วย `getSession()` ประจำไฟล์อ่าน `session_user_id` และ `session_role` ตรงๆ (jobs, jobs/my-job, crm, kpi, costs, content-planner, users, security, finance/settings, check-in/leave, events, items, kits, profile ฯลฯ) ผู้ใช้ที่ล็อกอินแล้วแก้ cookie สองตัวนี้เพื่อทำการในนามคนอื่นหรืออ้างเป็นแอดมินใน action เหล่านั้นได้ · ทางแก้: ตัวช่วยกลางแบบเดียวกับ `finance/actions.ts` (ใช้ `requireAuth()` ก่อน ตกไป cookie เก่าเฉพาะเมื่อไม่มี token และอ่าน role จากฐานข้อมูลเสมอ) แล้วเปลี่ยนทีละโมดูล
2. **proxy.ts** — ตกไปใช้ `session_user_id` เมื่อ token ไม่มีหรือไม่ผ่าน และด่านหน้าแอดมินใช้ `session_role` ที่ไม่ได้เซ็น
3. **policy แบบเดียวกันในบัคเก็ตอื่น** — `checkin_photos_all` (รูปเช็คอิน) เป็น FOR ALL ไม่ระบุ role เหมือนกัน · `docs/legacy-sql/setup_storage_policies.sql` ให้ role public เขียนและลบ `login_selfies` ได้ (ต้องตรวจว่ายังใช้อยู่บน production หรือไม่)
4. **ตัวอัปโหลดอื่นของบัคเก็ต ticket-attachments** — `uploadMyCommentAttachments` (jobs/my-job) และ `uploadContentExampleImages` (content-planner) ยังใช้ cookie ที่ไม่ได้เซ็นและเอานามสกุลจากชื่อไฟล์
5. **สคริปต์ล้างไฟล์จะลบไฟล์ที่ยังใช้อยู่** — `scripts/cleanup-storage.mjs` และ `cleanup-storage.sql` ตัดสินว่าไฟล์ใน ticket-attachments เป็นไฟล์กำพร้าโดยดูแค่ tickets, ticket_replies, my_job_comments, my_ticket_comments ไม่ได้ดู `kpi_evaluation_replies.attachments` และรูปตัวอย่างของ content-planner — **ห้ามรันแบบ --apply จนกว่าจะแก้**

