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

1. **ปิดแล้วใน v1.24.2** · **cookie ที่ไม่ได้เซ็นถูกเชื่อในราว 20 โมดูล** — ตัวช่วย `getSession()` ประจำไฟล์อ่าน `session_user_id` และ `session_role` ตรงๆ (jobs, jobs/my-job, crm, kpi, costs, content-planner, users, security, finance/settings, check-in/leave, events, items, kits, profile ฯลฯ) ผู้ใช้ที่ล็อกอินแล้วแก้ cookie สองตัวนี้เพื่อทำการในนามคนอื่นหรืออ้างเป็นแอดมินใน action เหล่านั้นได้ · ทางแก้: ตัวช่วยกลางแบบเดียวกับ `finance/actions.ts` (ใช้ `requireAuth()` ก่อน ตกไป cookie เก่าเฉพาะเมื่อไม่มี token และอ่าน role จากฐานข้อมูลเสมอ) แล้วเปลี่ยนทีละโมดูล
2. **ปิดแล้วใน v1.24.2** · **proxy.ts** — ตกไปใช้ `session_user_id` เมื่อ token ไม่มีหรือไม่ผ่าน และด่านหน้าแอดมินใช้ `session_role` ที่ไม่ได้เซ็น (ด่านหน้าแอดมินแก้ใน v1.24.1)
3. **policy แบบเดียวกันในบัคเก็ตอื่น** — `checkin_photos_all` (รูปเช็คอิน) เป็น FOR ALL ไม่ระบุ role เหมือนกัน · `docs/legacy-sql/setup_storage_policies.sql` ให้ role public เขียนและลบ `login_selfies` ได้ (ต้องตรวจว่ายังใช้อยู่บน production หรือไม่)
4. **ตัวอัปโหลดอื่นของบัคเก็ต ticket-attachments** — `uploadMyCommentAttachments` (jobs/my-job) และ `uploadContentExampleImages` (content-planner) ยังใช้ cookie ที่ไม่ได้เซ็นและเอานามสกุลจากชื่อไฟล์ · ส่วน cookie **ปิดแล้วใน v1.24.2** (`getSession()` ของทั้งสองไฟล์มาจาก `requireAuth()`) · เรื่องนามสกุลจากชื่อไฟล์ยังเปิดอยู่
5. **สคริปต์ล้างไฟล์จะลบไฟล์ที่ยังใช้อยู่** — `scripts/cleanup-storage.mjs` และ `cleanup-storage.sql` ตัดสินว่าไฟล์ใน ticket-attachments เป็นไฟล์กำพร้าโดยดูแค่ tickets, ticket_replies, my_job_comments, my_ticket_comments ไม่ได้ดู `kpi_evaluation_replies.attachments` และรูปตัวอย่างของ content-planner — **ห้ามรันแบบ --apply จนกว่าจะแก้**


## 2026-09-30 — ปิดสิทธิ์กุญแจสาธารณะ และช่องโหว่ของส่วนใบเบิก (v1.24.1)

พบระหว่างสำรวจเพื่อวางแผน refactor ส่วนใบเบิก (`docs/specs/finance-refactor-plan.md` ขั้น 0) ทุกข้อในหัวข้อ "สิ่งที่พบ" ตรวจกับฐานข้อมูลจริงแบบอ่านอย่างเดียวแล้ว

### สิ่งที่พบ

| # | ปัญหา | หลักฐาน |
|---|---|---|
| 1 | **กุญแจสาธารณะ (anon key) อ่านได้ 23 จาก 70 ตาราง รวม 8,102 แถว** โดยไม่ต้องล็อกอิน: `profiles` 52 แถว (PIN ที่เข้ารหัส, เลขบัตรประชาชน, ที่อยู่, เบอร์โทร, เลขบัญชี, `active_session_id`), `staff_checkins` 2,361, `jobs` 588, `job_checklist_items` 2,222, `tickets` 118, `ticket_replies` 441, `events` 187, `event_closures` 461, `items` 343, `kits` 130, `kpi_evaluations` 18 ฯลฯ | นับด้วยกุญแจสาธารณะ 2026-09-30 |
| 2 | **เข้าระบบเป็นคนอื่นได้** เมื่อรวมข้อ 1 กับ session แบบเก่า: `proxy.ts` ยอมรับ `session_user_id` + `session_id` ที่ไม่ได้เซ็น และทั้งสองค่าอ่านได้จากตาราง `profiles` ด้วยกุญแจสาธารณะ | อ่านโค้ด `proxy.ts` + ข้อ 1 (ไม่ได้ทดลองเข้าจริง) |
| 3 | คำสั่งแก้และลบด้วยกุญแจสาธารณะไม่ถูกปฏิเสธ บนตาราง `profiles`, `staff_checkins`, `jobs`, `tickets`, `events`, `items`, `kits` | ทดสอบกับ id ที่ไม่มีอยู่จริง (ไม่มีข้อมูลถูกเปลี่ยน) — ไม่ได้พิสูจน์ด้วยการเขียนจริง |
| 4 | โครงการเปิดให้สมัครบัญชีเอง (`disable_signup = false`) และหลายตารางมี policy `TO authenticated USING (true)` ใครสมัครด้วยอีเมลของตัวเองก็ได้สิทธิ์ `authenticated` | `/auth/v1/settings` + ไฟล์ migration (ไม่ได้ทดลองสมัคร) |
| 5 | ฟังก์ชันในฐานข้อมูลเรียกได้โดย `authenticated` และบางตัวโดย `anon`: `purge_test_documents`, `purge_test_salary_run`, `issue_document_number`, `next_doc_counter`, `salary_backfill_paid_slip_ids`, `get_schema_summary` · `REVOKE ... FROM PUBLIC` อย่างเดียวไม่ถอนสิทธิ์ที่ Supabase ให้ `anon`/`authenticated` ไว้ตรงๆ | ไฟล์ migration + ทดสอบกับ postgres 17 |
| 6 | `/finance/download` ส่งเลขบัตรประชาชนและที่อยู่ของทุกคนให้ผู้ใช้ทุกคน · `/finance/new` ส่งเลขบัญชีของทุกคน | อ่านโค้ด |
| 7 | `finance/settings-actions.ts` ตัดสินสิทธิ์จาก cookie `session_role` (7 ฟังก์ชันที่เขียน) และมี 3 ฟังก์ชันที่ไม่ตรวจการล็อกอิน | อ่านโค้ด |
| 8 | หน้าพิมพ์ของ `/finance/overview` และ `/finance/download` ใส่ชื่อใบเบิกลง HTML โดยไม่กรอง (stored XSS) | อ่านโค้ด |

### แก้แล้วในรุ่นนี้

| จุด | การแก้ |
|---|---|
| `proxy.ts` | อ่าน `profiles` ด้วยกุญแจฝั่ง server · ประตูหน้าแอดมินใช้บทบาทจากฐานข้อมูล ไม่ใช่ cookie · ตรวจด้วย `scripts/proxy-session.check.ts` |
| ฐานข้อมูล | `supabase/migrations/20260930_lock_public_access.sql`: เปิด RLS ทุกตารางใน public, ลบ policy ทุกตัวของ public และของ `storage.objects`, ถอนสิทธิ์ตาราง วิว ลำดับ และฟังก์ชันจาก `anon` และ `authenticated` · ทดสอบกับ postgres 17 ผ่าน 51 ข้อ · **ต้อง deploy โค้ดก่อน แล้วจึงรันบน production** |
| ส่วนใบเบิก | ข้อ 6–8 และหน้าของแอดมินตรวจบทบาทที่ยืนยันแล้ว · ตรวจด้วย `scripts/finance-access.check.ts` |

### ต้องทำเองในหน้า Supabase และ Railway

1. Supabase → Authentication → ปิดการสมัครบัญชีใหม่ (ระบบนี้ไม่ได้ใช้ Supabase Auth)
2. Railway → ตรวจว่าตั้งค่า `SESSION_SECRET` แล้ว ถ้าไม่ได้ตั้ง โค้ดจะใช้กุญแจสาธารณะเป็นกุญแจเซ็น session แทน ซึ่งทำให้ปลอม session ของใครก็ได้
3. เพราะ PIN ที่เข้ารหัสและ `active_session_id` เคยอ่านได้จากภายนอก: ให้ผู้ใช้ทุกคนเปลี่ยน PIN และล็อกอินใหม่หลังรัน SQL (PIN เป็นตัวเลขสั้น เมื่อได้ค่าที่เข้ารหัสไปแล้วเดาย้อนกลับได้ไม่ยาก)

### กติกาสำหรับ migration ใหม่ (Postgres ตั้งค่าเริ่มต้นให้ไม่ได้)

- ตารางใหม่: `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` และไม่สร้าง policy
- ฟังก์ชันใหม่: `REVOKE ALL ON FUNCTION ... FROM PUBLIC, anon, authenticated` แล้ว `GRANT EXECUTE ... TO service_role`

### ยังเปิดอยู่ — เรียงตามความเสี่ยง

1. **ปิดแล้วใน v1.24.2** · **session แบบเก่าใน `proxy.ts`**: ยังยอมรับ `session_user_id` ที่ไม่ได้เซ็นเมื่อไม่มี token หลังปิดสิทธิ์กุญแจสาธารณะแล้วคนนอกอ่าน `active_session_id` ไม่ได้ แต่ผู้ใช้ที่ล็อกอินอยู่ยังปลอมเป็นคนอื่นได้ถ้ารู้ค่าทั้งสอง · ทางแก้: เลิกรับ session แบบเก่า (ทุกคนต้องล็อกอินใหม่หนึ่งครั้ง)
2. **ปิดแล้วใน v1.24.2** · **cookie ที่ไม่ได้เซ็นในราว 20 โมดูล** (ข้อ 1 ของรอบ 2026-09-29) ยังเหมือนเดิม ยกเว้นส่วนใบเบิกที่แก้ครบแล้ว
3. `/api/schema/*` และ `/api/migrations/*` เปิดให้อ่านโครงสร้างฐานข้อมูลและไฟล์ migration โดยไม่ต้องล็อกอิน (ตั้งใจไว้สำหรับเทียบรุ่นระหว่างเครื่อง — ให้เจ้าของยืนยันว่ายังต้องเปิด)
4. **ปิดแล้วใน v1.24.2** · `/api/ai-analyze` ตรวจแอดมินจาก cookie `session_role`
5. ข้อ 4–5 ของรอบ 2026-09-29 (ตัวอัปโหลดอื่น, สคริปต์ล้างไฟล์) ยังเหมือนเดิม

## 2026-09-30 — เลิกรับ session แบบเก่า (v1.24.2)

### เปลี่ยนอะไร

- **ไม่มีโค้ดฝั่ง server อ่าน cookie `session_user_id` / `session_role` อีกแล้ว** — ทั้ง `proxy.ts`, `lib/auth.ts`, `lib/logger.ts`, `getSession()` ประจำไฟล์ของทุกโมดูล, หน้าและ layout ที่เคยอ่านบทบาทจาก cookie และ `/api/ai-analyze` · หน้าล็อกอินเลิกตั้ง cookie สองตัวนี้และลบของเก่าที่ค้างอยู่ · `proxy.ts` ลบ cookie ของ session ทั้งสี่ตัวทุกครั้งที่ส่งไปหน้าล็อกอิน
- **ตัวตน = `session_token` ที่เซ็นแล้ว + cookie `session_id` ที่ตรงกับ `profiles.active_session_id` ที่ไม่เป็น null** ของโปรไฟล์ที่อนุมัติแล้ว (`proxy.ts` ตรวจ `is_blocked` ด้วย) · ก่อนหน้านี้ `requireAuth()` ยอมรับ token เมื่อ `active_session_id` เป็น null หรือเมื่อไม่มี cookie `session_id` — token ของคนที่ออกจากระบบแล้ว ถูกแอดมินเตะออก หรือถูกระงับ จึงยังใช้ได้จนหมดอายุ 7 วัน
- **บทบาทมาจากฐานข้อมูลเสมอ** · `requireAuth()` เป็นแหล่งเดียว ถูก cache ต่อคำขอ (`react` `cache`) · `getSessionLight()` ดึงจาก `requireAuth()` จึงได้บทบาทจากฐานข้อมูลด้วย
- `/api/ai-analyze` (ไม่ผ่าน `proxy.ts`) และ `users/actions.ts` ตรวจแอดมินที่ยืนยันแล้ว — พนักงานได้ `{ error: 'เฉพาะ admin เท่านั้น' }` ก่อนหน้านี้ `updateUserRole` / `updateUserModules` / `toggleUserApproval` / `updateUserProfile` เช็คแค่ว่ามี cookie `session_user_id` (พนักงานเลื่อนตัวเองเป็นแอดมินได้)
- `logout()` ล้าง `active_session_id` เฉพาะของ session ที่ยืนยันแล้ว ก่อนหน้านี้ตั้ง cookie `session_user_id` เป็น id ของใครก็เตะคนนั้นออกได้
- ผู้กระทำใน `activity_logs` มาจาก token ที่เซ็นเท่านั้น

ตรวจด้วย `npx tsx scripts/proxy-session.check.ts` และ `npx tsx scripts/session-hardening.check.ts` (รัน `requireAuth`, action, layout, route และ `logout` ตัวจริงกับฐานข้อมูลจำลอง: cookie แบบเก่าอย่างเดียว, `active_session_id` เป็น null, ไม่มี/ไม่ตรง `session_id`, ถูกระงับ, ยังไม่อนุมัติ, token พนักงาน + cookie แอดมินปลอม · และสแกนทั้ง `app/` `lib/` `components/` `proxy.ts`)

### ผลต่อผู้ใช้ และสิ่งที่ต้องทำเอง

- session ที่มีแค่ cookie แบบเก่า (ไม่มี token หรือไม่มี `session_id`) ถูกส่งไปหน้าล็อกอินหนึ่งครั้ง · session ที่ล็อกอินหลังมี token แล้วใช้ต่อได้ตามปกติ
- ถ้าต้องการให้ทุกคนล็อกอินใหม่จริงตามที่แจ้งในหน้า "มีอะไรใหม่" (แนะนำ เพราะ `active_session_id` เคยอ่านได้จากภายนอกก่อน v1.24.1): หลัง deploy ให้เปลี่ยนค่า `SESSION_SECRET` ใน Railway (token เดิมทั้งหมดใช้ไม่ได้ทันที) หรือรัน `UPDATE profiles SET active_session_id = NULL;` บน production

### ยังเปิดอยู่

1. ข้อ 3 และ 5 ของรอบ v1.24.1 (`/api/schema/*`, `/api/migrations/*` · ตัวอัปโหลดอื่นเอานามสกุลจากชื่อไฟล์, สคริปต์ล้างไฟล์)
2. ตัวเซ็น session ยังถอยไปใช้กุญแจสาธารณะเมื่อไม่ได้ตั้ง `SESSION_SECRET` (ข้อ 2 ของ "ต้องทำเองในหน้า Supabase และ Railway" รอบ v1.24.1)
3. ข้อ 3 ของรอบ 2026-09-29 (policy แบบ FOR ALL ในบัคเก็ตอื่น)
