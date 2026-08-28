# Spec: งวดรายสัปดาห์ + จ่ายเช็คอินครั้งเดียว + sync ต้นทุน — ส่วนขยายของ `/salary`

ต่อยอดจาก `docs/specs/salary-module.md` (grill Q1–Q29) ด้วย grill รอบสอง Q1–Q16 (2026-08-28) · ศัพท์: `CONTEXT.md` · ADR-0001 (ใบเบิกค่าสตาฟอัตโนมัติถูกลบ → ส่วนขยายนี้ต้องทดแทนให้ครบ) · issue #20 (sub-issues #21–#25)

## Problem Statement

ฟรีแลนซ์ต้องได้ค่าออกอีเวนต์ **ทุกสัปดาห์** แต่โมดูลเงินเดือนมีแต่งวดรายเดือน (เดือนละ 1 งวด ตัดรอบวันที่ 25) และตั้งแต่ ADR-0001 ระบบเลิกออกใบเบิกค่าสตาฟอัตโนมัติ → ฟรีแลนซ์ไม่มีทางได้เงินก่อนสิ้นงวดเดือน และโมดูลต้นทุน (Costs) ไม่ได้รับต้นทุนสตาฟต่ออีเวนต์อีกเลย

## Solution

1. **งวดมีชนิด** — `salary_runs.kind` = `monthly` (เดิม) | `weekly` (จันทร์–อาทิตย์) | `custom` (ช่วงวันที่ตามใจ) — ฟอร์มเปิดงวดเดียวกัน ต่างแค่วิธีเลือกช่วง
2. **เช็คอินจ่ายได้ครั้งเดียว** — `staff_checkins.paid_slip_id` ตั้งตอนปิดงวดของสลิป ทุกชนิดงวดใช้กติกาเดียว: ดึง **เช็คอินหน้างานที่ยังไม่จ่าย** ที่ `checkin_at ≤ period_end` และย้อนไม่เกิน 60 วัน (เก็บตก) → งวดทับซ้อนกันได้โดยไม่จ่ายซ้ำ; กติกากันงวดทับใน `createSalaryRun` เดิมจึงถูกถอดออก
3. **เปิดงวดคลิกเดียว** — หน้า `/salary/runs` มีแบนเนอร์ "สัปดาห์ที่แล้ว (1–7 ก.ย.) ยังไม่เปิด [เปิดและคำนวณ]" → ระบบเปิดงวด + ติ๊กทุกคนที่มีเช็คอินค้างจ่าย + คำนวณให้ทันที admin เหลือแค่ตรวจ → ปิดงวดที่เหลือ → ดู **สรุปยอดโอน** (ชื่อ/ธนาคาร/เลขบัญชี/ยอด) + Excel → **จ่ายแล้วทั้งหมด**
4. **sync ต้นทุน** — เมื่อปิดงวดสลิป บรรทัดค่าสตาฟ/เบิ้ล ตจว./รันเนอร์ ที่ผูกอีเวนต์ได้ → `job_cost_items` (category `staff`) ของอีเวนต์นั้นใน Costs โดย auto-import อีเวนต์เข้า Costs ให้เหมือนพฤติกรรมเดิมของใบเบิก ใช้กับงวดทุกชนิด

## User Stories

### เปิดงวด (admin)
- [ ] เปิดหน้า `/salary/runs` แล้วเห็นแบนเนอร์เสนอ **สัปดาห์ที่จบแล้วล่าสุดที่ยังไม่มีงวด** (จันทร์–อาทิตย์) พร้อมจำนวนคน/เช็คอินที่ค้างจ่าย และปุ่ม "เปิดและคำนวณ" — คลิกเดียวได้งวดพร้อมสลิปร่างของทุกคนที่มีเช็คอินค้าง
- [ ] แบนเนอร์เดียวกันเสนอ **งวดเดือนที่ตัดรอบไปแล้วและยังไม่เปิด** ด้วย (ปุ่มเดียวกัน)
- [ ] ฟอร์ม "เปิดงวดเอง" เลือกชนิด `รายเดือน` (เลือกเดือน ช่วงมาจากวันตัดรอบเหมือนเดิม) / `รายสัปดาห์` (เลือกวันจันทร์ ระบบเติมอาทิตย์ให้) / `กำหนดเอง` (วันเริ่ม–วันสิ้นสุด) — ทุกชนิดมีตัวเลือก "คำนวณทันทีให้ทุกคนที่มีเช็คอินค้างจ่าย" ติ๊กไว้ให้
- [ ] ในหน้างวด ตอนเลือกคนก่อนคำนวณ ระบบ **ติ๊กให้เอง**: งวดสัปดาห์/กำหนดเอง = ทุกคนที่มีเช็คอินหน้างานค้างจ่ายในช่วง; งวดเดือน = ประจำ/ฝึกงานที่มีโปรไฟล์ทุกคน + ใครก็ตามที่มีเช็คอินค้าง — admin เอาออก/เพิ่มได้ก่อนกดคำนวณ
- [ ] เห็นกล่องเตือน "มีเช็คอินหน้างานค้างจ่ายเกิน 60 วัน N รายการ (ชื่อ, วันที่)" ในหน้า `/salary/runs` เพื่อไปเปิดงวด `กำหนดเอง` ย้อนหลังหรือแก้ด้วยรายการปรับมือ

### คำนวณ / ปิดงวด (admin)
- [ ] สลิปดึงเฉพาะเช็คอินหน้างานที่ **ยังไม่ถูกจ่าย** (`paid_slip_id IS NULL`) โดย `checkin_at ≤ period_end` และ `≥ period_end − 60 วัน` — ไม่ว่างวดชนิดไหน; งวดเดือนเพิ่มเงินเดือนฐาน + OT ออฟฟิศ **ในช่วงงวด** ให้ประจำ/ฝึกงาน; งวดสัปดาห์/กำหนดเองไม่มีฐาน (ประจำที่ออกงานก็ได้เฉพาะค่าสตาฟ/เบิ้ล/OT ของเช็คอินนั้น)
- [ ] เช็คอินที่จ่ายแล้วไม่ถูกนับซ้ำใน OT ของงวดถัดไป (OT ของเช็คอินหน้างานถือว่าจ่ายไปพร้อมสลิปที่จ่ายเช็คอินนั้น)
- [ ] ปิดงวดสลิป → ทุกเช็คอินในสลิปถูกประทับ `paid_slip_id`; ถ้ามีเช็คอินใดถูกจ่ายในสลิปอื่นไปก่อน (เปิดสองงวดทับกันแล้วปิดอีกงวดก่อน) การปิดงวดถูกปฏิเสธพร้อมบอกให้ "คำนวณใหม่"
- [ ] ปุ่ม "ปิดงวดที่เหลือทั้งหมด" (มีแล้ว) ใช้กับงวดสัปดาห์ได้เหมือนเดิม (บล็อกถ้ารันเนอร์ยังไม่กรอก)
- [ ] ตาราง **สรุปยอดโอน** ในหน้างวด: ชื่อ · ธนาคาร · เลขบัญชี (จาก `profiles.bank_name/bank_account_number` เตือนถ้าว่าง) · ยอดสุทธิ · สถานะ — ปุ่ม **Excel** (คอลัมน์เดียวกัน) และ **จ่ายแล้วทั้งหมด** (เฉพาะสลิปที่ปิดงวดแล้ว)
- [ ] ชื่อเรียกงวด/สลิป/แจ้งเตือน/PDF ของงวดสัปดาห์และกำหนดเอง = "สลิปค่าจ้าง 1–7 ก.ย. 69" (งวดเดือนยังเป็น "สลิปเงินเดือน ก.ย. 69")

### พนักงาน
- [ ] `/salary` แสดงสลิปทุกชนิดงวดที่ปิดแล้วของตัวเอง เรียงตามวันสิ้นสุดงวด ป้ายชื่อแยกชนิด
- [ ] ประวัติเช็คอิน / รายงานเช็คอิน (admin) แสดง "จ่ายในสลิป …" (ลิงก์) ต่อเช็คอินที่จ่ายแล้ว

### ต้นทุน (Costs)
- [ ] ปิดงวดสลิป → บรรทัด `site`/`oop` (ผูกเช็คอินที่มีอีเวนต์) และ `runner` (เฉพาะวันที่มีเช็คอินหน้างานอีเวนต์เดียว) ถูกเขียนเป็น `job_cost_items` category `staff` ของ `job_cost_events` ที่ตรงกับอีเวนต์ — ถ้าอีเวนต์ยังไม่อยู่ใน Costs ระบบ import ให้ (`importEventFromStock`) เหมือนพฤติกรรมใบเบิกเดิม
- [ ] 1 แถวต่อบรรทัดสลิป จำนวน = ยอดหลังแก้มือ, `cost_date` = วันเช็คอิน, `description` = "ค่าสตาฟ <ชื่อ> — <หน้าที่>", `notes` = `salary_slip::<slipId>::<line.key>` (idempotent: ปิดงวดซ้ำ/รัน sync ซ้ำไม่เพิ่มแถว)
- [ ] OT ไม่ sync (ไม่ผูกอีเวนต์เดียว); รายการปรับมือไม่ sync; sync ล้มเหลวไม่ทำให้ปิดงวดล้ม (log + warning ในสลิป + ปุ่ม sync อีกครั้ง)

## Implementation Decisions

### Schema (`supabase/migrations/20260829_salary_weekly_runs.sql` — idempotent)
- `salary_runs.kind text NOT NULL DEFAULT 'monthly' CHECK (kind IN ('monthly','weekly','custom'))`; `period_key` ยัง unique — งวดเดือน = `YYYY-MM` เดิม, สัปดาห์/กำหนดเอง = `YYYY-MM-DD_YYYY-MM-DD` (วันเริ่ม_วันสิ้นสุด) กัน 2 งวดช่วงเดียวกัน
- `staff_checkins.paid_slip_id uuid NULL REFERENCES salary_slips(id) ON DELETE SET NULL` + partial index `WHERE paid_slip_id IS NULL AND type = 'onsite'`; สลิปลบได้เฉพาะร่าง (trigger เดิม) จึงไม่มีทางหลุดสถานะจ่ายแล้ว
- `salary_slips.costs_synced_at timestamptz NULL` — บอกว่า sync ต้นทุนแล้ว
- RPC `finalize_salary_slip(p_slip_id uuid)` (SECURITY DEFINER): ล็อกแถวเช็คอินใน `lines[].checkin_id`; ถ้ามีตัวใด `paid_slip_id IS NOT NULL AND <> p_slip_id` → RAISE; ไม่งั้น `UPDATE staff_checkins SET paid_slip_id` + `UPDATE salary_slips SET status='finalized', finalized_at, finalized_by` ใน transaction เดียว
- backfill: สลิป finalized/paid ที่มีอยู่ → ประทับ `paid_slip_id` ให้เช็คอินใน `lines[].checkin_id` (SQL jsonb ใน migration) เพื่อไม่ให้งวดแรกหลัง deploy ดึงเช็คอินที่จ่ายไปแล้วมาซ้ำ

### เครื่องคำนวณ (`compute.ts`)
- `computeSlip` รับ `runKind` เพิ่ม: `base` = `base_salary` เฉพาะ `monthly` และประเภทการจ้างไม่ใช่ freelance; OT ออฟฟิศ (`office`) นับเฉพาะ `monthly`; OT ของวันที่มีเช็คอินหน้างานคิดจากเช็คอินที่ส่งเข้ามาเท่านั้น (ตัวเรียกกรองเช็คอินที่จ่ายแล้วออก)
- pure helper ใหม่ `selectCheckinsForRun(checkins, run, slipId?)`: onsite → `paid_slip_id` เป็น null หรือ `= slipId` และ `checkin_at ∈ [period_end − 60d, period_end]`; office → `[period_start, period_end]` เฉพาะ monthly; ตัวเรียกใช้ helper นี้ทั้ง `computeSlips` และ `recomputeSlip`
- pure helper `lastFinishedWeek(todayBangkok)` → `{start, end}` จันทร์–อาทิตย์ล่าสุดที่จบแล้ว; `weekRangeFor(monday)`
- คีย์บรรทัดเดิม (`site:date:checkin:duty` …) ใช้ต่อ ไม่เปลี่ยน → override คงอยู่

### Actions (`salary/actions.ts`, ไฟล์ใหม่ `salary/costs-sync.ts`)
- `createSalaryRun({kind, month? | start, end}, {autoCompute})` → period_key/label ตามชนิด; ถอด overlap check; `custom` ยาวไม่เกิน 62 วัน; ถ้า `autoCompute` เรียก `computeSlips(run, autoSelectUserIds(run))`
- `autoSelectUserIds(run)`: distinct `user_id` ของเช็คอิน onsite ค้างจ่ายในช่วง ∪ (monthly: โปรไฟล์ fulltime/intern ทั้งหมด)
- `getRunSuggestions()`: สัปดาห์ที่จบแล้วล่าสุดที่ไม่มี run weekly period_key นั้น + งวดเดือนที่ `period_end < วันนี้` และยังไม่มี; พร้อมนับคน/เช็คอินค้าง
- `listOverdueUnpaidCheckins()`: onsite, `paid_slip_id IS NULL`, `checkin_at < now − 60d`
- `finalizeSlip`: เรียก RPC `finalize_salary_slip` แล้วค่อย notification/log/`syncSlipToCosts`; `finalizeRemainingSlips` วนเรียกตัวเดียวกัน
- `markAllPaid(runId)`: ทุกสลิป finalized ใน run → paid + log
- `getTransferSummary(runId)` / `exportTransferExcel(runId)`: join `profiles` (full_name, bank_name, bank_account_number) — Excel ผ่าน `xlsx` (มีอยู่แล้ว) สร้างฝั่ง server ส่ง base64 เหมือนรายงานเช็คอิน
- `syncSlipToCosts(slipId)`: หา `job_cost_events` ด้วย `source_event_id` → ไม่มีให้ `importEventFromStock`; upsert แถวด้วย `notes` key; ตั้ง `costs_synced_at`; pure helper `costsRowsForSlip(slip, checkins)` แยกไว้ทดสอบได้

### UI
- `/salary/runs`: แบนเนอร์ข้อเสนอ (สูงสุด 2 ใบ: สัปดาห์ + เดือน) · กล่องค้างเกิน 60 วัน · ตารางงวดเพิ่มคอลัมน์ชนิด · ฟอร์มเปิดงวดแบบเลือกชนิด (native `<input type="date">` / `type="month">`)
- `/salary/runs/[runId]`: เลือกคนติ๊กให้เองตามกติกา · ส่วน "สรุปยอดโอน" + ปุ่ม Excel + จ่ายแล้วทั้งหมด · ปุ่ม sync ต้นทุนอีกครั้งในสลิปที่ปิดแล้ว
- `periodLabel(run)` รับ kind → "1–7 ก.ย. 69" / "ก.ย. 69"; ชื่อสลิป/PDF/แจ้งเตือนใช้ "สลิปค่าจ้าง" เมื่อ kind ≠ monthly
- เช็คอิน: history + รายงาน admin แสดง badge "จ่ายแล้ว" ลิงก์สลิป (ใช้ `paid_slip_id`)

### Activity log / แจ้งเตือน
- ActionType ใหม่: `SALARY_MARK_ALL_PAID`, `SALARY_COSTS_SYNC`; แจ้งเตือนใช้ `salary_finalized` เดิม เปลี่ยนแค่ข้อความ

## Testing Decisions
- `scripts/salary-check.ts` ส่วน A เพิ่ม: A12 weekly ไม่มีฐาน/ไม่มี OT ออฟฟิศ · A13 `selectCheckinsForRun`: เช็คอิน 40 วันก่อน period_end ถูกนับ, 61 วันไม่ถูกนับ, จ่ายแล้วไม่ถูกนับ · A14 monthly ประจำ: ฐาน + OT ออฟฟิศเฉพาะในช่วง · A15 `costsRowsForSlip`: อีเวนต์ 2 งานวันเดียว → runner ไม่ sync, OT ไม่ sync · A16 `lastFinishedWeek` (วันจันทร์/วันอาทิตย์/กลางสัปดาห์)
- `scripts/salary-trigger-check.sql` เพิ่ม B12 `finalize_salary_slip` ปฏิเสธเมื่อเช็คอินถูกจ่ายแล้ว · B13 ประทับ `paid_slip_id` ครบ · B14 backfill ของสลิปเก่า
- Costs sync ต่อ DB: `scripts/salary-costs-sync-check.ts` (ปฏิเสธ URL ที่ไม่ใช่ local เหมือน part B) — ถ้า local stack ยังใช้ไม่ได้ ให้ยึด A15 + code review แทน

## Acceptance Criteria (lock — ใช้ตัดสินทุกรอบใน loop)

| id | เกณฑ์ | วิธีตรวจ |
|---|---|---|
| AC1 | `npx tsc --noEmit` ไม่มี error เพิ่มจาก baseline ก่อนเริ่ม | รันคำสั่ง เทียบจำนวน |
| AC2 | `npx tsx scripts/salary-check.ts` ส่วน A ผ่านครบ (เดิม + A12–A16) | รันคำสั่ง |
| AC3 | migration ใหม่ + RPC ผ่าน `scripts/salary-trigger-check.sql` B1–B14 บน Postgres 17 container | docker exec psql |
| AC4 | `npm run build` exit 0 | รันคำสั่ง |
| AC5 | grep: `createSalaryRun` ไม่มี overlap check เหลือ; `finalizeSlip` เรียก RPC `finalize_salary_slip`; `importEventFromStock` ถูกเรียกจาก `salary/costs-sync.ts`; `markAllPaid` + `exportTransferExcel` export จาก actions | grep |
| AC6 | หน้า `/salary/runs` render แบนเนอร์จาก `getRunSuggestions` และกล่องจาก `listOverdueUnpaidCheckins` (grep ใน runs-view/page) | grep |
| AC7 | `UpdateEntry` ใหม่บนสุดของ `whats-new/updates.ts` + `docs/Project-workflow.md` ติ๊ก ticket | อ่าน |

`pass_threshold`: 0.85

## Out of Scope
- cron/เปิดงวดอัตโนมัติ (Q3 — แบนเนอร์ + คลิกเดียวพอ)
- ไฟล์โอนเงินตามฟอร์แมตธนาคาร (Excel ทั่วไปพอ)
- รวมหลายสลิปเป็นยอดโอนเดียวข้ามงวด
- แก้ `paid_slip_id` มือ / "ยกเลิกการจ่าย" (สลิปที่ปิดแล้วแก้ไม่ได้อยู่แล้ว — ใช้รายการปรับมือในงวดถัดไป)
- sync ต้นทุนย้อนหลังอัตโนมัติให้สลิปที่ปิดไปก่อน deploy (มีปุ่ม sync อีกครั้งต่อสลิปให้กดเอง)

## Further Notes
- **Assumptions ที่ตัดสินแทน user**: (1) หน้าต่างเก็บตก 60 วันเป็นค่าคงที่ในโค้ด (ยังไม่ใส่ app_settings) (2) สัปดาห์ = จันทร์ 00:00 – อาทิตย์ 23:59:59 เวลาไทย (3) ยอดโอน = `total` ของสลิป ไม่หักอะไรเพิ่ม (4) runner ผูกอีเวนต์เมื่อวันนั้นมีเช็คอินหน้างานที่ผูกอีเวนต์ **เพียงอีเวนต์เดียว** ไม่งั้นข้ามพร้อม warning `costs_runner_skipped` (5) `custom` ห้ามยาวเกิน 62 วัน กันเปิดผิด (6) งวดเดือนก็ใช้ paid-once → ประจำที่ได้ค่าสตาฟจากงวดสัปดาห์ไปแล้วจะไม่ได้ซ้ำในงวดเดือน (พฤติกรรมที่ต้องการ) (7) การปิดงวดย้ายจากโค้ดแอปไปเป็น RPC เพราะต้องล็อก + ประทับ + เปลี่ยนสถานะใน transaction เดียว — trigger guard เดิมยังทำงาน (RPC แค่เปลี่ยน draft→finalized ซึ่ง guard อนุญาต)
- **สิ่งที่ user ต้องทำเอง**: รัน migration `20260829_salary_weekly_runs.sql` บน prod ก่อน deploy (มี backfill); กรอกธนาคาร/เลขบัญชีใน `/users` ให้ฟรีแลนซ์ทุกคนก่อนงวดสัปดาห์แรก; กดปุ่ม sync ต้นทุนอีกครั้งให้สลิปที่ปิดไปก่อน deploy ถ้าต้องการต้นทุนย้อนหลัง
