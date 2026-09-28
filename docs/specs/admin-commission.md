# Spec: สรุปค่าคอมแอดมิน — `/sales-board/commission`

สถานะ: `ready-for-agent` · ที่มา: ไฟล์ "สรุปยอดค่าคอมแอดมิน 22 พ.ค. – 25 มิ.ย. 69" ของฝ่ายแอดมิน + การตรวจเทียบกับ CRM วันที่ 2026-09-28 · คำตัดสินของเจ้าของ 4 ข้อ (หน้าใหม่ใต้ Sales Board · งวด 25→25 ปรับช่วงเองได้ · วันล็อคคิว = วันเปลี่ยนสถานะในระบบ · เพิ่มช่องจำนวนตู้)

> **แก้กติกา 2026-09-28 (v1.17.1):** เจ้าของกำหนดงวดเป็น **25 → 25** (เดิม spec ล็อกไว้ 26 → 25) — วันที่ 25 จึงอยู่สองงวด และการ์ดที่ล็อคคิววันที่ 25 ถูกนับทั้งสองงวดพร้อมคำเตือน `cutoff_day`

---

## Problem Statement

ฝ่ายแอดมินมีเป้าต่องวด (ตัวอย่าง: ขายตู้ 10 ตู้ · ขายงานอีเวนต์ 40 งาน) และค่าคอมคิดจากงานที่ **ลูกค้าตอบรับแล้ว** ในงวดนั้น ปัจจุบันสรุปด้วยมือใน Google Sheets — ตรวจเทียบกับ CRM แล้วพบว่าไฟล์งวดแรกนับเกินจริง: งานที่ล็อคคิวเลยวันสิ้นงวด 3 งาน, งานเดียวกันถูกนับสองครั้ง 1 งาน, และออเดอร์ตู้ 3 ตู้ที่ระบบบันทึกว่าตอบรับตั้งแต่เดือนมีนาคม (ยอดจริงตามระบบ: อีเวนต์ 36 งาน · ตู้ 5 ตู้ จากที่ไฟล์ระบุ 40 และ 8)

Sales Board เดิมตอบเรื่องนี้ไม่ได้ เพราะนับตามเดือนปฏิทินและเดือนที่สร้างลีด ตั้งเป้าเป็นบาท และการ์ดที่เลื่อนสถานะเลย "เสร็จสิ้น" ไปแล้ว (ชำระครบ / เครดิต / ปิดงาน) หลุดจากการนับ

## Solution

หน้าใหม่ `/sales-board/commission` ("สรุปค่าคอมแอดมิน") ที่สร้างตารางแบบเดียวกับไฟล์ของฝ่ายแอดมินจากข้อมูล CRM โดยอัตโนมัติ:

- เลือกงวด (ค่าเริ่มต้น 25 เดือนก่อน → 25 เดือนนี้) และปรับวันเริ่ม–สิ้นสุดชั่วคราวได้
- การ์ดเป้า/ยอดจริง 2 ใบ: **ตู้** (หน่วย = ตู้) และ **อีเวนต์** (หน่วย = งาน)
- ตาราง 2 ตารางคอลัมน์เดียวกับไฟล์ต้นแบบ
- กล่อง **ต้องตรวจสอบ** บอกข้อมูลผิดปกติที่ทำให้ยอดเชื่อไม่ได้
- ส่งออก Excel หน้าตาเดียวกับไฟล์ต้นแบบ
- ช่อง **จำนวนตู้** ในการ์ด CRM ประเภทขาย

## กติกาการนับ (ล็อก — ห้ามเปลี่ยนโดยไม่แก้ spec)

| เรื่อง | กติกา |
|---|---|
| สถานะที่ถือว่า "ตอบรับแล้ว" (won) | ทุกสถานะ **ยกเว้น** `lead`, `booking`, `following_up`, `quotation_sent`, `rejected`, `cancelled` (เทียบแบบไม่สนตัวพิมพ์) — ครอบคลุม ตอบรับ, เสร็จสิ้น, รับมัดจำแล้ว, ชำระครบ, เครดิต, ปิดงาน, Pending Payment และสถานะที่เพิ่มทีหลัง |
| วันล็อคคิว | วันที่ (เวลาไทย) ของ `crm_activities` ชนิด `status_change` แถว **แรกสุด** ที่ `new_status` เป็น won — การเลื่อนกลับไปกลับมาทีหลังไม่เปลี่ยนวันนี้ |
| ไม่มีประวัติสถานะ | การ์ดที่สถานะปัจจุบันเป็น won แต่ไม่มีแถว status_change ที่เป็น won → ใช้วันสร้างการ์ด (เวลาไทย) และติดคำเตือน `no_history` |
| เงื่อนไขนับ | วันล็อคคิวอยู่ในช่วง `[from, to]` (นับทั้งสองปลาย) **และ** สถานะปัจจุบันเป็น won |
| ตู้ | `work_type = 'sale'` — นับเป็นจำนวนตู้ = `unit_count` (ว่าง / ≤ 0 = 1) |
| อีเวนต์ | `work_type = 'event'` — 1 การ์ด = 1 งาน |
| GP | `work_type = 'gp'` — ไม่อยู่ในเป้า ไม่แสดง ไม่นับ |
| ไม่ระบุประเภทงาน | ไม่นับ แต่แสดงในรายการ "ยังไม่ระบุประเภทงาน" และติดคำเตือน `no_work_type` |
| การ์ดที่ archive แล้ว | นับตามปกติ (archive เกิดหลังงานจบ ไม่เกี่ยวกับการตอบรับ) |
| งวด | งวดของเดือน `YYYY-MM` = วันที่ 25 ของเดือนก่อน ถึงวันที่ 25 ของเดือนนั้น (นับทั้งสองปลาย) · งวดปัจจุบัน = งวดที่สิ้นสุดถัดจากวันนี้ (วันที่ > 25 = งวดเดือนถัดไป; วันที่ 25 = งวดที่สิ้นสุดวันนั้น) |
| วันที่ 25 | อยู่ทั้งงวดที่สิ้นสุดและงวดที่เริ่มวันนั้น — การ์ดที่ล็อคคิววันที่ 25 ถูกนับ **สองงวด** และติดคำเตือน `cutoff_day` ทุกครั้งที่แสดง |

ponytail: วันตัดรอบเป็นค่าคงที่ 25 ในโค้ด (ตรงกับตัวนับถอยหลังของ Sales Board) — ย้ายไป `app_settings` เมื่อมีคนขอเปลี่ยนจริง

## User Stories

1. ในฐานะเจ้าของกิจการ ฉันต้องการเปิดหน้า สรุปค่าคอมแอดมิน แล้วเห็นยอดตู้/อีเวนต์ของงวดปัจจุบันเทียบเป้า โดยไม่ต้องรอไฟล์จากแอดมิน
2. ในฐานะเจ้าของกิจการ ฉันต้องการเลื่อนดูงวดก่อนหน้า/ถัดไป และปรับวันเริ่ม–สิ้นสุดเองชั่วคราว (เช่น งวดแรกที่เริ่ม 22 พ.ค.) พร้อมปุ่มคืนค่างวดปกติ
3. ในฐานะแอดมิน (role admin) ฉันต้องการตั้งเป้าตู้/อีเวนต์ของแต่ละงวดเป็น "จำนวน" — ผู้ใช้ทั่วไปเห็นเป้าแต่แก้ไม่ได้
4. ในฐานะฝ่ายแอดมิน ฉันต้องการเห็นตารางตู้ (ลำดับ · วันที่ล็อคคิว · จำนวนตู้ที่สั่งผลิต · ชื่อ LINE ลูกค้า · ใบเสนอราคา · สถานะงาน) และตารางอีเวนต์ (ลำดับ · วันที่ล็อคคิว · วันที่จัดงาน · ชื่อ LINE ลูกค้า · ใบเสนอราคา · สถานะงาน) — คลิกแถวไปการ์ด CRM
5. ในฐานะเจ้าของกิจการ ฉันต้องการเห็นกล่อง "ต้องตรวจสอบ" ที่บอกว่าการ์ดไหนมีปัญหาอะไร เพื่อให้แก้ก่อนจ่ายค่าคอม
6. ในฐานะฝ่ายแอดมิน ฉันต้องการกดส่งออก Excel แล้วได้ไฟล์หน้าตาเดียวกับที่เคยทำมือ
7. ในฐานะฝ่ายแอดมิน เมื่อสร้าง/แก้การ์ด CRM ประเภทขาย ฉันต้องการกรอกจำนวนตู้ได้

## Implementation Decisions

### เส้นทางและสิทธิ์
- `app/(authenticated)/sales-board/commission/page.tsx` (server) + `commission-view.tsx` (client) — อยู่ใต้ `/sales-board` จึงถูก proxy บังคับ module `salesboard` อยู่แล้ว (prefix match) **ไม่ต้องแก้ `proxy.ts` / `nav-config.ts`**
- ปุ่มลิงก์ "ค่าคอมแอดมิน" บนหัวหน้า Sales Board และปุ่ม "กลับ Sales Board" ในหน้าใหม่
- ดูได้ทุกคนที่เข้า Sales Board ได้ · ตั้งเป้าได้เฉพาะ role `admin` (ตรวจที่ server action ด้วย `requireAuth()`; ปุ่มซ่อนสำหรับคนอื่น)

### ตัวคำนวณ — `app/(authenticated)/sales-board/commission-logic.ts` (pure: ไม่มี React / IO / `new Date()` แบบไม่รับพารามิเตอร์)
```ts
export const COMMISSION_CUTOFF_DAY = 25
export function isWonStatus(status: string | null | undefined): boolean
export function bangkokDay(iso: string): string                      // timestamptz → 'YYYY-MM-DD' เวลาไทย
export function commissionPeriod(month: string): { from: string; to: string } | null   // 'YYYY-MM'
export function defaultPeriodMonth(today: string): string            // today = 'YYYY-MM-DD'
export function buildLockDates(activities: StatusActivity[]): Map<string, string>      // lead_id → วันล็อคคิว
export function buildCommission(input: {
  leads: CommissionLead[]; lockDates: Map<string, string>; from: string; to: string
}): CommissionResult
export function mergeTargets(existing: Record<string, number>, patch: Record<string, number | null>, scope: 'commission' | 'board'): Record<string, number>
```
- `CommissionLead` = `{ id, status, customer_name, customer_line, event_date, event_end_date, work_type, unit_count, quotation_ref, created_at }`
- `CommissionResult` = `{ booths: Row[]; events: Row[]; unclassified: Row[]; boothUnits: number; eventCount: number; warnings: Warning[] }`
- `Row` มี `no` (ลำดับเริ่ม 1), `leadId`, `lockDate`, `units`, `eventDate`, `eventEndDate`, `customer` (= `customer_line` ที่ trim แล้ว ถ้าว่างใช้ `customer_name`), `quotationRef`, `status`
- เรียงแถว: วันล็อคคิว → วันจัดงาน → ชื่อลูกค้า
- `Warning` = `{ code, leadId, customer, detail }` โดย `code` ∈
  `no_work_type` · `no_event_date` (ประเภทอีเวนต์ที่ไม่มีวันจัดงาน) · `end_before_start` (วันสิ้นสุด < วันเริ่ม) · `no_quotation_ref` · `dup_quotation_ref` (เลขเดียวกันหลัง trim + ไม่สนตัวพิมพ์ ในแถวของงวด) · `possible_duplicate` (ชื่อลูกค้าเดียวกันหลัง trim/lowercase + วันจัดงานเดียวกัน ในตารางอีเวนต์) · `no_history` · `cutoff_day` (วันล็อคคิวตรงกับวันที่ 25)
- `mergeTargets`: `scope: 'commission'` เขียนเฉพาะคีย์ `cm_booths` / `cm_events` (ค่า `null` หรือ ≤ 0 = ลบคีย์) และคงคีย์อื่นไว้ · `scope: 'board'` แทนที่คีย์ที่ไม่ขึ้นต้นด้วย `cm_` ทั้งชุด และคงคีย์ `cm_*` เดิมไว้

### ชั้นข้อมูล — `page.tsx`
- ดึง `crm_leads` เฉพาะคอลัมน์ของ `CommissionLead` (แบ่งหน้า 1000 แถวแบบเดียวกับ `sales-board/page.tsx`)
- **ทนต่อการยังไม่รัน migration**: ถ้า query ที่มี `unit_count` error ให้ดึงใหม่โดยไม่มีคอลัมน์นั้น แล้วส่ง `unitCountAvailable = false` ให้ view แสดงแถบเตือน "ยังไม่ได้เพิ่มช่องจำนวนตู้ในฐานข้อมูล — ทุกการ์ดนับเป็น 1 ตู้"
- ดึง `crm_activities` (`activity_type = 'status_change'`, เรียงเวลาเก่า→ใหม่), `sales_board_targets`, `crm_settings` (`category = 'kanban_status'` → ป้ายสถานะภาษาไทย)
- คำนวณ `lockDates` ฝั่ง server แล้วส่ง leads ที่สถานะปัจจุบันเป็น won + วันล็อคคิวให้ client; client กรองตามช่วงด้วย `buildCommission`
- `today` (YYYY-MM-DD เวลาไทย) คำนวณฝั่ง server แล้วส่งเป็น prop (กัน hydration mismatch)

### หน้าจอ — `commission-view.tsx`
- หัวหน้า: ชื่อหน้า · ตัวเลื่อนงวด (◀ งวด มิถุนายน 2569 ▶) · ช่องวันที่ 2 ช่อง (`<input type="date">`) · ปุ่ม "คืนค่างวดปกติ" (แสดงเมื่อช่วงถูกปรับ) · ปุ่ม "ตั้งเป้า" (admin) · ปุ่ม "ส่งออก Excel" · ลิงก์กลับ Sales Board
- บรรทัดสรุปแบบหัวไฟล์ต้นแบบ: "เป้าหมายแอดมิน ขายตู้ N ตู้ ขายงานอีเวนต์ M งาน กำหนดเวลา d/m/พ.ศ. - d/m/พ.ศ."
- การ์ด 2 ใบ: ยอดจริง / เป้า, %, แถบความคืบหน้า, "เหลืออีก X ถึงเป้า" หรือ "ถึงเป้าแล้ว" — ไม่มีเป้า = แสดงยอดจริงอย่างเดียว
- ตาราง 2 ตาราง (จอใหญ่วางคู่กัน จอเล็กเรียงลง) + รายการ "ยังไม่ระบุประเภทงาน (ไม่ถูกนับ)" เมื่อมี
- กล่อง "ต้องตรวจสอบ" จัดกลุ่มตาม `code` พร้อมลิงก์ไปการ์ด CRM — ว่าง = ไม่แสดงกล่อง
- วันที่แสดงแบบ "จันทร์ 25 พ.ค. 69" (พ.ศ. 2 หลัก) · งานหลายวันแสดง "24 มิ.ย. – 19 ก.ค. 69"
- เป้าผูกกับเดือนของงวดที่เลือก แม้ช่วงวันที่ถูกปรับชั่วคราว
- ข้อความ UI เป็นภาษาไทยตรงๆ แบบเดียวกับ `sales-board-view.tsx` (โมดูลนี้ไม่ใช้ `t()`)

### เป้า — `sales-board/actions.ts`
- ใหม่: `saveCommissionTargets(month, { booths, events })` — `requireAuth()` + role `admin` เท่านั้น, ตรวจรูปแบบเดือน, อ่านแถวเดิมแล้ว `mergeTargets(..., 'commission')`, `logActivity('UPDATE_COMMISSION_TARGET', { month, booths, events })`, `revalidatePath` ทั้งสองหน้า, คืน `{ error }` เมื่อพลาด
- แก้: `saveMonthTargets` อ่านแถวเดิมแล้ว `mergeTargets(..., 'board')` เพื่อไม่ให้การบันทึก/ล้างเป้าจาก Sales Board ลบเป้าค่าคอม
- เพิ่ม `'UPDATE_COMMISSION_TARGET'` ใน `ActionType` ของ `lib/logger.ts`
- เก็บในตารางเดิม `sales_board_targets.targets` (jsonb) — ไม่สร้างตารางใหม่

### จำนวนตู้ — CRM
- Migration `supabase/migrations/20260928_crm_leads_unit_count.sql` (idempotent): `unit_count integer` + CHECK `unit_count is null or unit_count >= 1`
- `createLead` / `updateLead` (`crm/actions.ts`): รับ `unit_count` จาก FormData; บันทึกเป็นจำนวนเต็ม ≥ 1 **เฉพาะเมื่อ** `work_type = 'sale'` มิฉะนั้นบันทึก `null`; ไม่ส่งฟิลด์มา = ไม่แตะคอลัมน์ (updateLead)
- `add-lead-dialog.tsx`: ช่องตัวเลข "จำนวนตู้ (เฉพาะงานขาย)" ใต้ตัวเลือกประเภทงาน ค่าเริ่มต้น 1
- `[id]/lead-detail.tsx`: การ์ดข้อมูลลูกค้า — โหมดแก้ไขมีช่อง "จำนวนตู้" เมื่อประเภทงานเป็นขาย; โหมดดูแสดงแถว "จำนวนตู้" เมื่อประเภทงานเป็นขาย

### ส่งออก Excel
- ฝั่ง client ด้วยแพ็กเกจ `xlsx` ที่มีอยู่ (`aoa_to_sheet`) — ห้ามเพิ่ม dependency
- แถว 1 คอลัมน์ B: บรรทัดสรุปเป้า · แถว 5: หัวตาราง · คอลัมน์ A–F = ตู้, G–L = อีเวนต์ วางคู่กันเหมือนไฟล์ต้นแบบ หัวคอลัมน์สะกดตามหน้าจอ
- ชื่อไฟล์: `สรุปยอดค่าคอมแอดมิน - <วันเริ่ม> - <วันสิ้นสุด>.xlsx`
- ตัวสร้างข้อมูลแผ่นงาน (array of arrays) แยกเป็นฟังก์ชัน pure `buildExportSheet(result, targets, range)` ใน `commission-logic.ts` เพื่อทดสอบได้

### เอกสาร
- `CONTEXT.md`: เพิ่มหัวข้อ "ค่าคอมแอดมิน" — ศัพท์ งวดค่าคอม, วันล็อคคิว, ตอบรับแล้ว (won), จำนวนตู้
- `whats-new/updates.ts`: entry ใหม่บนสุด (ภาษาผู้ใช้) · `package.json` → `1.17.0`
- `scripts/commission-backfill-work-type.sql`: SQL ให้เจ้าของรันเอง — ส่วนที่ 1 `SELECT` ดูรายการการ์ดที่ตอบรับช่วง 2026-05-22 ถึง 2026-06-25, `work_type IS NULL`, มี `event_date` และ `event_date >=` วันล็อคคิว; ส่วนที่ 2 `UPDATE ... SET work_type = 'event'` ด้วยเงื่อนไขเดียวกัน อยู่ใน `BEGIN; ... ROLLBACK;` (ผู้รันเปลี่ยนเป็น `COMMIT` เองเมื่อตรวจแล้ว)

## Testing Decisions

ไม่มี test runner — ใช้สคริปต์ runnable ตามแนวทาง repo

**`scripts/commission-check.ts`** (`npx tsx scripts/commission-check.ts`, fixture สังเคราะห์ในไฟล์ — **ห้ามใช้ชื่อลูกค้าจริง**):

| id | กรณี |
|---|---|
| C1 | `commissionPeriod('2026-06')` = 2026-05-25 → 2026-06-25 · `'2026-01'` = 2025-12-25 → 2026-01-25 · รูปแบบผิด = `null` |
| C2 | `defaultPeriodMonth`: 2026-06-25 → `2026-06` · 2026-06-26 → `2026-07` · 2026-12-26 → `2027-01` |
| C3 | วันล็อคคิว = การเปลี่ยนเป็น won ครั้งแรก · `'Success'` ตัวพิมพ์ใหญ่ถือเป็น won |
| C4 | ขอบงวด: ล็อค 2026-05-25 และ 2026-06-25 นับ · 2026-05-24 และ 2026-06-26 ไม่นับ (งวด 05-25 → 06-25) |
| C5 | โซนเวลา: `2026-06-25T17:30:00Z` = วันล็อคคิว 2026-06-26 |
| C6 | สถานะปัจจุบันเป็น `rejected` / `quotation_sent` / `lead` → ไม่นับ แม้เคยตอบรับ |
| C7 | เลื่อนกลับเป็น lead แล้วตอบรับใหม่ → วันล็อคคิวคือครั้งแรก |
| C8 | ไม่มีประวัติ + สถานะ won → ใช้วันสร้างการ์ด + คำเตือน `no_history` |
| C9 | จำนวนตู้: `3` → 3 · `null` → 1 · `0` / ติดลบ → 1 · `boothUnits` = ผลรวม |
| C10 | `gp` ไม่ปรากฏที่ใด · `work_type` ว่าง → อยู่ใน `unclassified` ไม่ถูกนับ + `no_work_type` |
| C11 | คำเตือน `end_before_start`, `no_event_date`, `no_quotation_ref`, `dup_quotation_ref` (มีช่องว่างนำหน้า/ตัวพิมพ์ต่างกัน), `possible_duplicate` |
| C12 | เรียงตามวันล็อคคิวแล้ววันจัดงาน · `no` เริ่ม 1 ต่อเนื่อง |
| C13 | `mergeTargets`: scope commission คงคีย์ `sales`/`deals` · scope board คงคีย์ `cm_*` · ส่ง `{}` แบบ board ล้างเฉพาะคีย์ที่ไม่ใช่ `cm_*` |
| C14 | `buildExportSheet`: แถว 5 เป็นหัวตาราง 12 คอลัมน์ · ตู้อยู่คอลัมน์ A–F อีเวนต์ G–L · จำนวนแถวข้อมูล = max(ตู้, อีเวนต์) |
| C15 | การ์ดล็อคคิว 2026-06-25 ถูกนับทั้งงวด มิ.ย. และงวด ก.ค. พร้อมคำเตือน `cutoff_day` ทั้งสองงวด · การ์ดล็อค 06-24 ไม่มีคำเตือนนี้ |

**ตรวจกับข้อมูลจริง (Critic รันเอง แบบอ่านอย่างเดียว ไม่ commit)**: ป้อนข้อมูล CRM จริงเข้า `buildLockDates` + `buildCommission` ช่วง 2026-05-22 → 2026-06-25 โดยจำลองการเติมประเภทงานตามกติกาของ `commission-backfill-work-type.sql` ในหน่วยความจำ → ต้องได้ อีเวนต์ 36 งาน · การ์ดตู้ 5 ใบ

## Acceptance Criteria (lock — ใช้ตัดสินทุกรอบใน loop)

| id | เกณฑ์ | วิธีตรวจ |
|---|---|---|
| AC1 | `npx tsc --noEmit` ได้ 13 error เท่า baseline (ไม่มี error ในไฟล์ที่แก้/สร้าง) | รันคำสั่ง |
| AC2 | `npx tsx scripts/commission-check.ts` ผ่านครบ C1–C15 และ exit code ≠ 0 เมื่อมีกรณีไม่ผ่าน | รันคำสั่ง + อ่านโค้ด |
| AC3 | `npx eslint` บนไฟล์ที่แก้/สร้าง ได้ 0 error | รันคำสั่ง |
| AC4 | `commission-logic.ts` export ครบตามรายการใน spec และไม่ import `react`, `next/*`, `@/lib/supabase*` | grep |
| AC5 | มี `sales-board/commission/page.tsx` + `commission-view.tsx`; Sales Board มีลิงก์ไป `/sales-board/commission`; `proxy.ts` และ `lib/nav-config.ts` ไม่ถูกแก้ | อ่าน + git diff |
| AC6 | `page.tsx` มี fallback เมื่อคอลัมน์ `unit_count` ไม่มี และ view แสดงแถบเตือนเมื่อ `unitCountAvailable = false` | อ่านโค้ด |
| AC7 | หน้าจอมีครบ: ตัวเลื่อนงวด, ช่องวันที่ 2 ช่อง, ปุ่มคืนค่างวดปกติ, การ์ด 2 ใบ, ตาราง 2 ตารางที่หัวคอลัมน์ตรงกับ User Story 4, รายการไม่ระบุประเภทงาน, กล่องต้องตรวจสอบ, ปุ่มส่งออก Excel | อ่านโค้ด + smoke render |
| AC8 | `saveCommissionTargets` ตรวจ role admin ฝั่ง server, ใช้ `mergeTargets`, เรียก `logActivity('UPDATE_COMMISSION_TARGET', …)`; `saveMonthTargets` คงคีย์ `cm_*`; `ActionType` มี literal ใหม่ | อ่านโค้ด + grep |
| AC9 | Migration idempotent มี CHECK; `createLead`/`updateLead` บันทึก `unit_count` เฉพาะงานขาย; ฟอร์มสร้างและหน้ารายละเอียดมีช่องจำนวนตู้ | อ่านโค้ด |
| AC10 | ส่งออก Excel ใช้ `xlsx` ที่มีอยู่ ผ่าน `buildExportSheet`; `package.json` ไม่มี dependency ใหม่ | git diff |
| AC11 | ข้อมูลจริงช่วง 2026-05-22 → 2026-06-25 (จำลองเติมประเภทงาน) ได้อีเวนต์ 36 งาน · การ์ดตู้ 5 ใบ | Critic รันสคริปต์อ่านอย่างเดียว |
| AC12 | `UPDATES[0]` เป็น entry ใหม่ภาษาผู้ใช้ไม่มีศัพท์เทคนิค; `package.json` = `1.17.0`; `CONTEXT.md` มีหัวข้อค่าคอมแอดมิน; มี `scripts/commission-backfill-work-type.sql` ที่ลงท้ายด้วย `ROLLBACK;` | อ่าน |

`pass_threshold`: 0.85

## Out of Scope

- คำนวณ "จำนวนเงิน" ค่าคอม (ไฟล์ต้นแบบมีแต่จำนวนนับเทียบเป้า — อัตราค่าคอมยังไม่ถูกกำหนดในระบบ)
- แยกยอดรายคน (เป้าเป็นของทีมแอดมินทั้งทีม)
- ช่อง "วันที่ล็อคคิว" แบบกรอกเอง และลิงก์เซ็นใบเสนอราคาแบบ URL (ใช้เลขใบเสนอราคา + ลิงก์ไปการ์ด CRM)
- บันทึกงวดแบบกำหนดเองถาวร · เปลี่ยนวิธีนับของการ์ดเดิมบน Sales Board
- แก้ข้อมูล CRM ที่ผิด (วันจัดงาน 4 การ์ด, เลขใบเสนอราคาซ้ำ 4 คู่) — เจ้าของแก้เองในหน้า CRM โดยดูจากกล่องต้องตรวจสอบ

## Further Notes

- **สิ่งที่ user ต้องทำเอง**: (1) รัน `20260928_crm_leads_unit_count.sql` บน production ก่อน deploy (2) ถ้าต้องการดูงวด พ.ค.–มิ.ย. 69 ให้รัน `scripts/commission-backfill-work-type.sql` หลังตรวจรายการ (3) แก้การ์ดที่กล่องต้องตรวจสอบแจ้ง (4) ตั้งเป้าของแต่ละงวด
- **Assumption ที่ตัดสินแทน user**: การ์ด archive แล้วยังนับ · GP ไม่อยู่ในเป้า · สถานะใหม่ที่เพิ่มใน kanban ภายหลังถือเป็น won โดยอัตโนมัติถ้าไม่อยู่ในรายการยกเว้น · วันที่แสดงเป็น พ.ศ.
