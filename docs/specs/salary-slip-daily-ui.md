# Spec: หน้าสลิปแบบ "รายวัน" + งานค้างก่อนปิดงวด + เปิดแก้ไขหลังปิดงวด — `/salary/[slipId]`

ต่อยอด `docs/specs/salary-module.md` + `docs/specs/salary-weekly-runs.md` ด้วย grill Q1–Q12 (2026-08-28) · ศัพท์: `CONTEXT.md` · issue #26 (sub-issues #27–#30)

## Problem Statement

หน้าสลิปปัจจุบันแยกเป็น 2 ตาราง ("รายการเงิน" กับ "เช็คอินในงวด") admin ต้องเลื่อนขึ้นลงเพื่อดูว่าบรรทัดเงินมาจากเช็คอินไหน, แก้เช็คอิน 1 ครั้งต้องเปิด dialog หลายช่องแล้วกด "คำนวณใหม่" + ยืนยัน, คำเตือนบอกปัญหาแต่ไม่พาไปแก้, ปุ่มบนหัว 5–6 ปุ่มไม่บอกว่าต้องกดอะไรต่อ และเมื่อปิดงวดแล้วแก้อะไรไม่ได้เลยแม้พบข้อผิดพลาด

## Solution

1. **มุมมองรายวัน** — 1 แถว = 1 วัน รวมเช็คอินของวันนั้น (เข้า–ออก, หน้าที่, อีเวนต์, ตจว.) กับเงินของวันนั้น (ค่าสตาฟ / เบิ้ล / OT / รันเนอร์) ท้ายตารางเป็นฐาน + รายการปรับมือ + ยอดสุทธิ — เดสก์ท็อปเป็นตาราง มือถือเป็นการ์ดรายวัน
2. **แก้ตรงในแถว** — คลิกช่องแล้วแก้ ระบบบันทึกและคำนวณใหม่ให้อัตโนมัติ (ไม่มีปุ่ม "คำนวณใหม่" / dialog ยืนยัน); รันเนอร์กรอกในแถว + "ใช้ยอดนี้กับวันที่ยังว่าง"; แก้มือ = คลิกตัวเลขพิมพ์ทับ + เหตุผลบรรทัดเดียว
3. **งานค้างก่อนปิดงวด** — checklist ด้านบน คลิกแล้วเลื่อนไปแถววันนั้นและไฮไลต์ช่องที่ต้องแก้; คำเตือนที่ยอมรับได้กด "ยอมรับ" ได้; ปุ่ม "ปิดงวด" บอกจำนวนที่ค้างและกดไม่ได้จนเคลียร์
4. **หัวสลิปติดขอบบน** — ยอดสุทธิ + งานค้าง + ปุ่มหลักปุ่มเดียวตามสถานะ (ร่าง → ปิดงวด / ปิดแล้ว → จ่ายแล้ว) ปุ่มรองในเมนู ⋯
5. **เปิดแก้ไขหลังปิดงวด** — admin กด "เปิดแก้ไข" ใส่เหตุผล → สลิปกลับเป็นร่างทั้งใบ (ปลดประทับเช็คอิน) → แก้ → ปิดงวดใหม่ (ประทับใหม่, อัปเดตต้นทุน, แจ้งเตือน) — ประวัติการเปิดแก้ (ใคร/เมื่อไร/เหตุผล/ยอดก่อน→หลัง) อยู่ในสลิป + PDF + activity log; สลิปที่จ่ายแล้วก็เปิดแก้ได้ ระบบจำยอดที่จ่ายไปและแสดงส่วนต่างตอนปิดงวดใหม่

## User Stories

### มุมมองรายวัน (admin)
- [ ] เปิดสลิปร่างแล้วเห็นตารางเรียงวันที่ (เฉพาะวันที่มีเช็คอิน/บรรทัดเงิน) คอลัมน์: วันที่ · เช็คอิน (ประเภท, เข้า–ออก) · หน้าที่ · อีเวนต์ · ตจว. · ค่าสตาฟ · เบิ้ล · OT (ชม. + บาท) · รันเนอร์ · รวมวัน — วันที่มีเช็คอิน 2 ครั้งแสดง 2 แถวย่อยใต้วันเดียวกัน
- [ ] คลิกช่องเวลาเข้า/ออก → แก้ในที่ (native time input) → blur/Enter = บันทึก + คำนวณใหม่ + แถวกระพริบยืนยัน; Esc ยกเลิก
- [ ] คลิกช่องหน้าที่ → เลือกหลายรายการ (checkbox list ใน popover) บันทึกเมื่อปิด; ช่องอีเวนต์ → combobox ค้นชื่อ (อีเวนต์ในช่วง ±7 วันของช่วงเก็บตก); ตจว. = toggle
- [ ] ยอดค่าสตาฟ/เบิ้ล/OT คลิกแล้วพิมพ์ทับ + ช่องเหตุผล 1 บรรทัด (บังคับ) = แก้มือ; ค่าที่แก้มือแสดงขีดเส้นใต้ประ + hover เห็นค่าระบบ; ปุ่มล้างแก้มือ
- [ ] รันเนอร์: ช่องตัวเลขในแถว, Tab ไปวันถัดไปที่ยังว่าง, ปุ่ม "ใช้ยอดนี้กับวันที่ยังว่าง" ถัดจากช่องแรกที่กรอก
- [ ] แถว "เพิ่มเช็คอินที่ลืม" ท้ายตาราง: กรอกวันที่/เวลา/หน้าที่/อีเวนต์ในแถวเดียวแล้ว Enter
- [ ] เช็คอินที่จ่ายในสลิปอื่นแล้ว แสดงเป็นแถวจาง + ป้าย "จ่ายในสลิปอื่น" (ลิงก์) แก้ไม่ได้
- [ ] ท้ายตาราง: เงินเดือนฐาน (งวดเดือน) · รายการปรับมือ (เพิ่ม/ลบในแถว) · ยอดสุทธิ
- [ ] มือถือ (< md): การ์ดรายวัน แสดงสรุปวัน (วันที่, ชื่ออีเวนต์, รวมวัน, ไอคอนเตือน) แตะเปิดแผงแก้ใต้การ์ด (ช่องเดียวกับเดสก์ท็อป แต่เรียงแนวตั้ง)

### งานค้าง / หัวสลิป
- [ ] แถบหัวติดขอบบน: ชื่อ · สถานะ · ยอดสุทธิ · "งานค้าง N" · ปุ่มหลัก (ร่าง: "ปิดงวด (ค้าง N)" disabled จนกว่า N = 0 / ปิดแล้ว: "จ่ายแล้ว") · เมนู ⋯ (PDF, ส่งเข้าต้นทุนอีกครั้ง, เปิดแก้ไข, กลับหน้างวด)
- [ ] checklist งานค้างใต้หัว: จัดกลุ่มตามชนิด ("ไม่มีเวลาออก 3 วัน", "ไม่ได้ผูกอีเวนต์ 1 วัน", "ไม่ได้ติ๊กหน้าที่ 1 วัน", "รันเนอร์ยังไม่กรอก 2 วัน", "ค่าที่แก้มือหาย 1 บรรทัด") คลิกรายการ → เลื่อนไปแถว + ไฮไลต์ช่อง 2 วิ
- [ ] คำเตือนชนิด ไม่มีเวลาออก / ไม่ได้ผูกอีเวนต์ / ไม่ได้ติ๊กหน้าที่ / ค่าที่แก้มือหาย กด "ยอมรับ" ได้ (บันทึกว่าใครยอมรับ) — ยอมรับแล้วไม่นับเป็นงานค้าง แต่ยังแสดงจางๆ; รันเนอร์ยังไม่กรอก ยอมรับไม่ได้ (พิมพ์ 0 ได้)
- [ ] คำนวณใหม่อัตโนมัติหลังทุกการแก้ต้นทาง; ปุ่ม "คำนวณใหม่" และ dialog ยืนยันถูกถอดออก (เหลือในเมนู ⋯ เป็น "คำนวณใหม่ทั้งใบ" เผื่อ rate card เปลี่ยน)

### เปิดแก้ไขหลังปิดงวด (admin)
- [ ] สลิปสถานะปิดงวดแล้ว/จ่ายแล้ว มี "เปิดแก้ไข" ในเมนู ⋯ → dialog บังคับเหตุผล ≥ 10 ตัวอักษร (จ่ายแล้วมีคำเตือนเพิ่ม "จ่ายไปแล้ว X บาท เมื่อ … ส่วนต่างต้องโอนเพิ่ม/หักเอง") → สลิปกลับเป็นร่าง
- [ ] เมื่อเปิดแก้: เช็คอินของสลิปปลดประทับ (paid_slip_id = null), พนักงานได้แจ้งเตือน "สลิป … ถูกเปิดแก้ไข" และมองไม่เห็นสลิปจนกว่าจะปิดงวดใหม่, activity log `REOPEN_SALARY_SLIP` (เหตุผล, ยอดก่อน)
- [ ] ปิดงวดใหม่: ประทับเช็คอินใหม่, ต้นทุนใน Costs อัปเดตตามยอดใหม่และลบบรรทัดที่ไม่มีแล้ว, แจ้งเตือนพนักงานอีกครั้ง, ประวัติการเปิดแก้บันทึกยอดหลัง
- [ ] สลิปที่เคยจ่ายแล้ว: หัวสลิปแสดง "จ่ายไปแล้ว X · ยอดใหม่ Y · ส่วนต่าง ±Z" จนกว่าจะกด "จ่ายแล้ว" อีกครั้ง (ประวัติการจ่ายเก็บทุกครั้ง)
- [ ] ประวัติการเปิดแก้แสดงท้ายสลิป (ใคร/เมื่อไร/เหตุผล/ยอดก่อน → หลัง) และใน PDF เป็นบรรทัดท้าย "แก้ไขครั้งที่ n: … "

### พนักงาน
- [ ] `/salary/[id]` ของตัวเอง = มุมมองรายวันเดียวกัน อ่านอย่างเดียว (ไม่มีช่องแก้, ไม่มีงานค้าง) + ประวัติการเปิดแก้ถ้ามี

## Implementation Decisions

### Schema (`supabase/migrations/20260830_salary_slip_reopen.sql` — idempotent)
- `salary_slips.accepted_warnings jsonb NOT NULL DEFAULT '[]'` — `[{key, by, at}]` โดย key = `${code}:${date}:${checkin_id ?? ''}`
- `salary_slips.reopen_history jsonb NOT NULL DEFAULT '[]'` — `[{at, by, by_name, reason, total_before, total_after|null, refinalized_at|null}]`
- `salary_slips.paid_history jsonb NOT NULL DEFAULT '[]'` — `[{at, by, total}]` เติมทุกครั้งที่กด "จ่ายแล้ว"; `paid_total numeric NULL` = ยอดที่จ่ายล่าสุด (คง `paid_at/paid_by` เดิม)
- RPC `reopen_salary_slip(p_slip_id, p_user_id, p_reason)` SECURITY DEFINER: ต้อง finalized/paid, เหตุผล ≥ 10; `SET LOCAL app.allow_salary_purge = 'on'` แล้ว: `UPDATE staff_checkins SET paid_slip_id = NULL WHERE paid_slip_id = p_slip_id`; `UPDATE salary_slips SET status='draft', finalized_at=NULL, finalized_by=NULL, reopen_history = reopen_history || {…}` (คง `paid_at/paid_total/paid_history` ไว้เป็นประวัติ); guard trigger เดิมไม่ต้องแก้ (GUC ผ่อนอยู่แล้ว)
- `finalize_salary_slip` เดิม: เพิ่ม — ถ้า `reopen_history` มีรายการที่ `refinalized_at IS NULL` ให้เติม `total_after`, `refinalized_at`
- guard trigger: เพิ่ม `accepted_warnings` ในลิสต์ที่ห้ามแก้หลังปิด (คอลัมน์ใหม่อื่นถูกเขียนโดย RPC/ตอนจ่ายเท่านั้น — `paid_total/paid_history` ต้องอนุญาตให้เปลี่ยนตอน finalized→paid)

### Compute (`compute.ts` — pure)
- `groupSlipByDay(lines, checkins, warnings)` → `DayRow[]` `{date, checkins: [{checkin, siteLines, oopLine}], otLine?, runnerLines[], warnings[], dayTotal}` — ใช้ทั้งเดสก์ท็อป/มือถือ/พนักงาน
- `pendingItems(warnings, accepted, lines)` → `{count, groups: [{code, label, items: [{key, date, checkin_id, accepted}]}]}` — `runner_missing` มาจาก `lines.kind==='runner' && amount===null`; นับเฉพาะที่ยังไม่ accepted
- `hasMissingAmounts` เดิมคงไว้ (finalize ยังบล็อกรันเนอร์ null)

### Actions
- ทุก action แก้ต้นทางจากในสลิป (`adminEditCheckin`/`adminCheckIn`/`adminUpdateCheckinEvent` แล้ว `recomputeSlip`) รวมเป็น `editSlipCheckin(slipId, checkinId, patch)` / `addSlipCheckin(slipId, input)` ที่ทำครบใน server action เดียว → คืน `SlipDetail` ใหม่ (client ไม่ต้อง `router.refresh` หลายรอบ)
- `setRunnerAmounts(slipId, [{key, amount}])` — batch สำหรับ "ใช้ยอดนี้กับวันที่ยังว่าง"
- `acceptSlipWarning(slipId, key)` / `unacceptSlipWarning` — draft เท่านั้น; `finalizeSlip` ยอมให้ปิดเมื่อ `pendingItems.count === 0` (เดิมบล็อกแค่รันเนอร์ — คำเตือนอื่นที่ไม่ยอมรับตอนนี้ **บล็อก** ด้วย ตาม Q4)
- `reopenSlip(slipId, reason)` → RPC + notification `salary_reopened` (reference salary_slip) + `logActivity('REOPEN_SALARY_SLIP', {reason, total_before})`
- `markSlipPaid`: เติม `paid_history`, `paid_total`; `markAllPaid` เช่นกัน
- `syncSlipToCosts`: reconcile เต็ม — ลบ `job_cost_items` ที่ `notes LIKE 'salary_slip::<id>::%'` และไม่อยู่ใน wanted, อัปเดต `job_event_id` ด้วย
- `getSlipForView`: owner เห็นเฉพาะ finalized/paid (ร่างที่เปิดแก้ = มองไม่เห็น) — กติกาเดิมครอบอยู่แล้ว

### UI (`app/(authenticated)/salary/[slipId]/`)
- `slip-view.tsx` เขียนใหม่: `SlipHeader` (sticky, `position: sticky; top: 0`) · `PendingChecklist` · `SlipDayTable` (≥ md) / `SlipDayCards` (< md) · `SlipFooter` (ฐาน/ปรับมือ/ยอด) · `ReopenHistory` · dialogs: ปิดงวด, จ่ายแล้ว, เปิดแก้ไข
- inline cell components ใน `components/inline-cells.tsx`: `TimeCell`, `DutiesCell`, `EventCell`, `ToggleCell`, `MoneyCell` (override), `RunnerCell` — ทุกตัว optimistic + `useTransition` + กระพริบ (`animate-pulse` 1 รอบ) เมื่อบันทึกสำเร็จ, toast เฉพาะ error
- ลบ `slip-lines-table.tsx`, `slip-checkins-table.tsx`, `line-override-popover.tsx` เมื่อไม่มีใครใช้
- jump-to-row: `id="day-<date>"` + `scrollIntoView` + class ไฮไลต์ 2 วิ
- PDF: บรรทัด "แก้ไขครั้งที่ n วันที่ … โดย … เหตุผล …" ท้ายสลิปเมื่อมี `reopen_history`; แสดง "ยอดที่จ่ายไปแล้ว/ส่วนต่าง" เมื่อ `paid_total` ≠ total

### แจ้งเตือน / log
- notification type ใหม่ `salary_reopened` (category salary, URL เดิม); ActionType ใหม่ `REOPEN_SALARY_SLIP`, `ACCEPT_SALARY_WARNING`

## Testing Decisions
- `scripts/salary-check.ts`: A18 `groupSlipByDay` (2 เช็คอินวันเดียว → 1 วัน 2 แถวย่อย, OT/รันเนอร์เกาะวัน, dayTotal ถูก) · A19 `pendingItems` (accepted ไม่นับ, runner null นับ, override_dropped นับ)
- `scripts/salary-trigger-check.sql`: B18 `reopen_salary_slip` finalized → draft + เช็คอินปลดประทับ + history 1 รายการ · B19 เหตุผลสั้น < 10 → RAISE · B20 ปิดงวดใหม่ → ประทับกลับ + `total_after/refinalized_at` เติม · B21 draft ธรรมดา reopen → RAISE
- UI: ตรวจด้วย `npm run build` + เปิดหน้าใน dev ดู responsive (ไม่มี e2e)

## Acceptance Criteria (lock)

| id | เกณฑ์ | วิธีตรวจ |
|---|---|---|
| AC1 | `npx tsc --noEmit` ไม่มี error เพิ่มจาก baseline | รันคำสั่ง |
| AC2 | `npx tsx scripts/salary-check.ts` ผ่านครบ (+A18, A19) | รันคำสั่ง |
| AC3 | migration + RPC ผ่าน `scripts/salary-trigger-check.sql` B1–B21 บน Postgres 17 container | docker exec psql |
| AC4 | `npm run build` exit 0 | รันคำสั่ง |
| AC5 | grep: `slip-lines-table.tsx`, `slip-checkins-table.tsx`, `line-override-popover.tsx` ไม่มีในโค้ด; `reopen_salary_slip` ถูกเรียกจาก actions; `confirmRecompute` ไม่มีใน slip-view; `groupSlipByDay` ใช้ทั้ง table/cards/employee view | grep |
| AC6 | `finalizeSlip` ปฏิเสธเมื่อ `pendingItems.count > 0` และผ่านเมื่อคำเตือนถูก accept (unit ใน script A19 + อ่านโค้ด) | script + grep |
| AC7 | `UpdateEntry` บนสุดของ whats-new + Project-workflow ติ๊ก | อ่าน |

`pass_threshold`: 0.85

## Out of Scope
- undo หลายขั้น / เวอร์ชันสลิปเต็มรูปแบบ (เก็บแค่ประวัติเปิดแก้ + ยอดก่อน/หลัง)
- แก้ไขบางบรรทัดขณะยังปิดงวดอยู่ (Q8 ข)
- แก้สลิปจากมือถือแบบ inline ในตาราง (มือถือใช้แผงใต้การ์ด)
- คีย์ลัดคีย์บอร์ดนอกเหนือ Tab/Enter/Esc

## Further Notes
- **Assumptions ที่ตัดสินแทน user**: (1) ระหว่างเปิดแก้ พนักงานมองไม่เห็นสลิป (เหมือนร่าง) (2) คำเตือนที่ยอมรับได้ = ทุกชนิดยกเว้น `runner_missing` (3) ยอมรับคำเตือนแล้ว เมื่อคำนวณใหม่แล้วคำเตือนหายไป รายการยอมรับก็ถูกทิ้ง (ไม่ต้องล้างเอง) (4) "ปิดงวด" ต้องงานค้าง = 0 — เข้มกว่าเดิมที่บล็อกแค่รันเนอร์ (5) หน้าไม่ใช้ dialog ยืนยันสำหรับการแก้ต้นทาง แต่ยังใช้สำหรับ ปิดงวด / จ่ายแล้ว / เปิดแก้ไข (6) ประวัติการจ่ายเก็บใน jsonb ไม่แยกตาราง
- **สิ่งที่ user ต้องทำเอง**: รัน `20260830_salary_slip_reopen.sql` บน prod ก่อน deploy
