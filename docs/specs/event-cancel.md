# ยกเลิกอีเวนต์ (cancel / reschedule) — แผนและเกณฑ์ (Planner 2026-10-29)

เกณฑ์ (AC) ล็อกไว้ตั้งแต่วางแผน · Executor = Opus · Critic ตรวจเทียบเกณฑ์นี้เท่านั้น · pass_threshold 0.85

## ข้อเท็จจริงจากโค้ดและ production (อ่านอย่างเดียว)

- `events.status` เป็น enum `event_status` = `upcoming | completed | cancelled` — prod มี 300 อีเวนต์: upcoming 195, completed 99, **cancelled 6** (ตั้งตรงในฐานข้อมูล โค้ดไม่มีทางตั้ง)
- `jobs/tracking/tracking-logic.ts::CLOSED_EVENT_STATUSES = ['completed','closed']` **ไม่รวม cancelled** → อีเวนต์ที่ยกเลิกแล้ววันนี้ยังถูกนับว่า "เปิด" ในบอร์ดวันงาน / QR กระเป๋า / MCP / รายการอีเวนต์
- `packing/actions.ts::cancelPackingList` มีอยู่แล้ว: ยกเลิกใบได้เฉพาะ `selecting` / `picking` (ใบ `ready` ต้อง `reopenPacking` ก่อน) → ย้อนการหยิบ ถอดจองกระเป๋า ลบใบ
- `events/actions.ts::updateEvent` เปลี่ยนวัน/เวลาได้อยู่แล้ว แต่ไม่แจ้งใคร · ใบจัดของอิงวันจาก `events` (ไม่มีคอลัมน์วันของตัวเอง)
- `event-status-badge.tsx` รองรับค่า `cancelled` อยู่แล้ว · ตารางที่อ้าง `events`: event_staff, event_vehicles, event_kits, packing_lists, staff_checkins, expense_claims, stock_movements, job_cost_events (source_event_id), crm_leads (event_id)

## การตัดสินใจ (ค่าเริ่มต้นของผู้วางแผน — เจ้าของเปลี่ยนได้)

| # | เรื่อง | ตัดสินใจ |
|---|---|---|
| D1 | ใครยกเลิกได้ | ผู้มีสิทธิ์ปิดงาน (`getEventManager('close')`) และแอดมิน — กลุ่มเดียวกับคนปิดงาน |
| D2 | ยกเลิกได้เมื่อ | status `upcoming` และของยังไม่ออกงาน: ไม่มีใบจัดของ หรือใบอยู่ขั้น selecting / picking / ready · ใบ `out` / `returned` → ปฏิเสธ ให้ใช้เส้นคืนของ + ปิดงานตามปกติ |
| D3 | ผลของการยกเลิก | `status='cancelled'` + `cancelled_at/cancelled_by/cancel_reason` · ใบจัดของถูกยกเลิก (ready → reopen ก่อน แล้วใช้ core ของ `cancelPackingList`: ย้อนหยิบ ลบใบ ถอดจอง) · การจองที่เหลือใน `event_kits` ลบ + `recomputeKitPointers` · `event_staff` / `event_vehicles` / เช็คอิน / `job_cost_events` / ใบเบิก **เก็บไว้เป็นประวัติ** (ต้นทุนแสดงป้ายยกเลิก ไม่แก้ตัวเลข) · CRM lead **ไม่เปลี่ยนสถานะอัตโนมัติ** แต่บันทึก `crm_activities` "ยกเลิกอีเวนต์ <ชื่อ>: <เหตุผล>" · แจ้งเตือนทีมใน `event_staff` (ไม่แจ้งผู้กด) type ใหม่ `event_cancelled` · `logActivity('CANCEL_EVENT')` |
| D4 | กู้คืน | แอดมินเท่านั้น `restoreEvent` → `upcoming` ล้าง 3 ฟิลด์ (ไม่กู้ใบจัดของ/การจอง — สร้างใบใหม่เอง) `logActivity('RESTORE_EVENT')` |
| D5 | cancelled = ปิด | เพิ่ม `'cancelled'` ใน `CLOSED_EVENT_STATUSES` และให้ทุกจุดที่เทียบ `'completed'` ตรงๆ ใช้ `isClosedEvent` แทน (events-view, overview-view, costs/events-list-view, costs/[id]/event-cost-detail-view, events/[id]/return/page, close-core เฉพาะจุดตรวจ) |
| D6 | เลื่อนวัน | ใน `updateEvent` เมื่อ `event_date` / `event_time` / `event_end_time` เปลี่ยน → แจ้งเตือน `event_rescheduled` ถึง `event_staff` "เลื่อน <ชื่อ>: <วันเดิม> → <วันใหม่>" + `crm_activities` เมื่อผูก lead · ไม่แตะใบจัดของ · อีเวนต์ที่ยกเลิกแล้วแก้ไม่ได้ (`{ error: 'อีเวนต์นี้ยกเลิกแล้ว' }`) |
| D7 | UI | ปุ่ม "ยกเลิกอีเวนต์" บนการ์ดใน `/events` (เฉพาะ canClose และ status upcoming) → dialog เหตุผล (บังคับ ≥ 3 ตัวอักษร) + รายการผลกระทบ (ใบจัดของ/การจอง/แจ้งทีม) · การ์ดที่ยกเลิกซ่อนเหมือนปิดงาน (ปุ่มสลับเดิมเปลี่ยนป้ายเป็น "แสดงที่ปิด/ยกเลิก") แสดง badge ยกเลิก + เหตุผล + ผู้ยกเลิก · ปุ่ม "กู้คืน" บนการ์ดที่ยกเลิก (แอดมิน) · หน้า edit ของอีเวนต์ที่ยกเลิก: แบนเนอร์ + ฟอร์มปิด · กล่องยืนยันใช้ `finance/use-confirm.tsx` + toast |
| D8 | ไม่ทำ | ลบอีเวนต์ถาวร · เปลี่ยนสถานะ lead อัตโนมัติ · ปรับตัวเลขต้นทุน/รายได้ · กู้ใบจัดของ |

## แผนงาน (ลำดับ)

1. migration `supabase/migrations/20261102_event_cancel.sql` — `ALTER TYPE event_status ADD VALUE IF NOT EXISTS 'cancelled'` (no-op บน prod) + `ALTER TABLE events ADD COLUMN IF NOT EXISTS cancelled_at timestamptz, cancelled_by uuid REFERENCES profiles(id) ON DELETE SET NULL, cancel_reason text` · type มือใน `events/types.ts` หรือจุดที่ `Event` ถูกนิยาม
2. `tracking-logic.ts`: `CLOSED_EVENT_STATUSES` เพิ่ม `'cancelled'` · 6 ไฟล์ตาม D5 ใช้ `isClosedEvent`
3. `lib/notifications.ts`: type `event_cancelled`, `event_rescheduled` (+ ไอคอน/ข้อความใน UI กระดิ่งถ้า map ตาม type) · `lib/logger.ts`: `CANCEL_EVENT`, `RESTORE_EVENT`
4. `events/actions.ts`: `cancelEvent(id, reason)`, `restoreEvent(id)` · ใน `updateEvent`: ปฏิเสธ cancelled + แจ้งเลื่อนวัน · แยก core ของการยกเลิกใบจัดของออกจาก `cancelPackingList` ให้เรียกซ้ำได้ด้วย db + userId (ไม่ทำซ้ำสองชุด)
5. UI: `events-view.tsx` ปุ่ม/dialog/badge/ปุ่มกู้คืน/toggle · `events/[id]/edit/page.tsx` แบนเนอร์ · dictionary ทั้ง th/en
6. ชุดตรวจ `scripts/event-cancel.check.ts` (ฐานจำลองแบบ `scripts/packing-flow.check.ts`) + static render ของการ์ด (แบบ `scripts/packing-render.check.ts`)

## เกณฑ์ที่ล็อก (acceptance criteria)

- **AC1** migration ตามข้อ 1 รันซ้ำได้ (IF NOT EXISTS ทุกคำสั่ง) และมี comment ว่า `cancelled` มีใน enum อยู่แล้วบน prod
- **AC2** `cancelEvent`: ไม่ใช่ closer → `{ error }` ไม่เขียนอะไร · status completed/cancelled → `{ error }` · เหตุผล trim < 3 → `{ error }` · ใบจัดของ out/returned → `{ error }` ที่บอกให้ใช้เส้นคืนของ · สำเร็จ: แถว events มี status cancelled + 3 ฟิลด์ · ไม่มีแถว `packing_lists` ของอีเวนต์ และ items ที่เคยหยิบกลับเป็น available (ทดสอบทั้งใบ picking และ ready) · `event_kits` ของอีเวนต์ = 0 แถว · `crm_activities` +1 แถวเมื่อมี `crm_lead_id` (0 เมื่อไม่มี) · notifications ถึงทุกคนใน event_staff ยกเว้นผู้กด · `activity_logs` มี CANCEL_EVENT พร้อม reason
- **AC3** `restoreEvent`: ไม่ใช่แอดมิน → `{ error }` · อีเวนต์ที่ไม่ได้ cancelled → `{ error }` · สำเร็จ: upcoming + 3 ฟิลด์เป็น null + log RESTORE_EVENT
- **AC4** `isClosedEvent('cancelled') === true` · static scan: 6 ไฟล์ตาม D5 ไม่มี `=== 'completed'` / `!== 'completed'` เหลืออยู่ (ยกเว้นบรรทัดที่ตั้งค่า `status: 'completed'`) · MCP `list events` ไม่คืนอีเวนต์ cancelled (mcp-tools.check ยังผ่าน)
- **AC5** `updateEvent`: อีเวนต์ cancelled → `{ error: 'อีเวนต์นี้ยกเลิกแล้ว' }` ไม่เขียน · เปลี่ยน event_date → notifications `event_rescheduled` ถึง event_staff พร้อมวันเดิม→ใหม่ในข้อความ และ `crm_activities` เมื่อผูก lead · ไม่เปลี่ยนวัน/เวลา → ไม่มี notification
- **AC6** static render ของ `EventsView`: การ์ด cancelled มี badge ยกเลิก + เหตุผล + ไม่มีปุ่มปิดงาน/ยกเลิก + มีปุ่มกู้คืนเมื่อ isAdmin (ไม่มีเมื่อไม่ใช่) · การ์ด upcoming + canClose มีปุ่มยกเลิก · canClose=false ไม่มี · ค่าเริ่มต้นซ่อนการ์ด cancelled (นับรวมในปุ่มสลับ)
- **AC7** `npx tsx scripts/event-cancel.check.ts` ลงท้าย `event-cancel: ผ่านทั้งหมด` · `packing-flow`, `layout-requests`, `crm-leads-load`, `proxy-session`, `lib/mcp-tools.check.ts` ยังผ่าน · `npx eslint "app/(authenticated)/events"` = 0 error (warning เดิม 18 ไม่เพิ่ม) · tsc = error เดิม 1 จุด
- **AC8** What's New entry + bump เป็น v1.74.0 (planner ทำตอน release) · ไม่ใช้ `window.confirm` · ข้อความ UI ผ่าน dictionary

## เกณฑ์ที่ไม่ตัดสินใจแทน (ถามเจ้าของได้ภายหลัง — ไม่บล็อกงาน)

- ยกเลิกแล้วควรเปลี่ยนสถานะ lead ใน CRM เป็นอะไรไหม (ตอนนี้ไม่เปลี่ยน แค่บันทึกกิจกรรม)
- รายได้/ต้นทุนของอีเวนต์ที่ยกเลิกควรหลุดจาก P&L ไหม (ตอนนี้แสดงป้ายยกเลิกแต่ตัวเลขคงเดิม)
- อีเวนต์ 6 รายการที่ cancelled อยู่แล้วใน prod ไม่มีเหตุผล/ผู้ยกเลิก — ปล่อยว่าง
