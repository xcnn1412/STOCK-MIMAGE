# Spec: โมดูล "เงินเดือน" (Salary) — `/salary`

สถานะ: `ready-for-agent` · issue: [#9](https://github.com/xcnn1412/STOCK-MIMAGE/issues/9)
ที่มา: grill 3 รอบ 2026-08-28 (Q1–Q29) — ศัพท์ตาม `CONTEXT.md` หัวข้อ "เงินเดือน" · ADR: `docs/adr/0001-salary-replaces-auto-staff-claims.md`

---

## Problem Statement

ค่าแรงทีมงานคิดในชีต Google Sheets ด้วยมือ: admin ไล่ดูเช็คอิน "ไปหน้างาน" ทีละแถว กรอกหน้าที่ นับครั้ง คูณอัตรา บวกเบิ้ลต่างจังหวัด บวก OT — ผิดง่าย ตรวจย้อนหลังยาก และพนักงานไม่เห็นว่าตัวเองได้อะไรจากงานไหน ระบบปัจจุบันมีเพียง "ใบเบิกค่าสตาฟ" ที่สร้างอัตโนมัติตอน check-out (`autoCreateExpenseFromCheckin`) ซึ่งคิดจาก **บทบาทในอีเวนต์** (ฝ่ายขาย/กราฟิก/ช่างกล้อง…) ไม่ใช่ **หน้าที่หน้างาน** ที่ทำจริง (ส่ง/เก็บตู้, ขับรถ, รันเนอร์, ออกงานสตาฟ) จึงใช้แทนการคิดเงินเดือนจริงไม่ได้ และไม่มีเงินเดือนฐาน/OT/หนังสือรับรองเงินเดือนในระบบเลย

## Solution

โมดูลใหม่ "เงินเดือน" (module key `salary`) ที่คิดค่าแรงจาก **ข้อมูลเช็คอินที่มีอยู่** ต่องวดเงินเดือน (วันตัดรอบกำหนดได้ ค่าเริ่มต้น 25):

- พนักงาน**ติ๊กหน้าที่หน้างาน**ตอนเช็คอิน "ไปหน้างาน" (หลายหน้าที่ได้) ระบบเติม**จังหวัด/เขต**จากพิกัด GPS ให้และแก้ได้
- admin เปิดงวด → เลือกคน (กรองแผนก/ประเภทการจ้าง) → **คำนวณ**: เงินเดือนฐาน (ประจำ) + OT นอกเวลาทำงานต่อคน + ค่าสตาฟรายครั้งตาม rate card + เบิ้ลต่างจังหวัด (admin ติ๊กต่อครั้ง) + รันเนอร์ (admin กรอกต่อวัน) + รายการปรับมือ
- ทุกบรรทัดที่ระบบคิด admin **แก้มือทับได้** (เก็บทั้งค่าคำนวณและค่าที่แก้ + เหตุผล) แก้ข้อมูลต้นทาง (เวลาเข้า-ออก, หน้าที่, ตจว.) แล้วคำนวณใหม่ได้โดยไม่ทับค่าที่แก้มือไว้
- **ปิดงวด**ทีละสลิป → สลิปล็อกที่ฐานข้อมูล (แก้/ลบไม่ได้แม้ admin) พนักงานได้แจ้งเตือนและเห็นสลิปของตัวเอง + PDF; admin กด **จ่ายแล้ว** เมื่อโอนเงิน
- หนังสือรับรองเงินเดือนเป็นประเภทเอกสารใหม่ `SC` ในโมดูลเอกสาร เติมข้อมูลจากตั้งค่าเงินเดือนอัตโนมัติ admin อนุมัติแล้วได้เลขที่
- ใบเบิกค่าสตาฟอัตโนมัติจากเช็คอิน**ยกเลิก** (โมดูลเงินเดือนเป็นที่เดียวที่คิดค่าสตาฟ — ADR-0001)

## User Stories

### เช็คอิน (ข้อมูลต้นทาง)
1. ในฐานะพนักงาน เมื่อเช็คอิน "ไปหน้างาน" ฉันต้องการติ๊กหน้าที่ที่ทำในเที่ยวนี้ได้หลายข้อ (บังคับอย่างน้อย 1) เพื่อให้ระบบคิดค่าสตาฟได้โดยไม่ต้องให้ admin กรอกทีหลัง
2. ในฐานะพนักงาน ฉันต้องการให้ระบบเติมจังหวัด/เขตจากตำแหน่งที่เช็คอินให้เอง และเลือกแก้จาก dropdown ได้ถ้าไม่ตรง เพื่อให้ admin ใช้ตรวจเรื่องต่างจังหวัดได้
3. ในฐานะ admin ฉันต้องการเห็นหน้าที่และจังหวัดของแต่ละเช็คอินในหน้าประวัติ/รายงานเช็คอินเดิม เพื่อตรวจก่อนคำนวณ
4. ในฐานะ admin เมื่อสร้างเช็คอินย้อนหลังให้พนักงาน ฉันต้องการระบุหน้าที่และจังหวัดได้ในฟอร์มเดียวกัน
5. ในฐานะเจ้าของกิจการ ฉันต้องการให้ check-out หน้างาน**ไม่สร้างใบเบิกค่าสตาฟ**อีก เพื่อไม่จ่ายซ้ำกับสลิปเงินเดือน

### ตั้งค่า (admin)
6. ในฐานะ admin ฉันต้องการกำหนดวันตัดรอบงวด (ค่าเริ่มต้น 25) และอัตราเบิ้ลต่างจังหวัด (ค่าเริ่มต้น 300) ในที่เดียว
7. ในฐานะ admin ฉันต้องการจัดการ rate card หน้าที่หน้างาน (ชื่อ, อัตราต่อครั้ง, โหมด "กรอกมือรายวัน" สำหรับรันเนอร์, เปิด/ปิด, ลำดับ) โดยไม่ต้องแก้โค้ด
8. ในฐานะ admin ฉันต้องการตั้งค่าต่อคน: ประเภทการจ้าง (ประจำ/ฟรีแลนซ์), เงินเดือนฐาน, เวลาทำงาน (ค่าเริ่มต้น 10:00–19:00), อัตรา OT บาท/ชม., ตำแหน่ง, วันเริ่มงาน — กรองรายชื่อตามแผนกได้
9. ในฐานะ admin ฉันต้องการเปิด/ปิดโมดูล `salary` ให้ผู้ใช้รายคนจากหน้า `/users` เดิม

### งวดคำนวณ (admin)
10. ในฐานะ admin ฉันต้องการเปิดงวดจากรายการเดือน (ระบบคำนวณช่วงวันที่จากวันตัดรอบให้) และเห็นงวดที่เคยเปิดพร้อมจำนวนสลิปแต่ละสถานะ
11. ในฐานะ admin ฉันต้องการเลือกคนเข้างวดโดยกรองแผนก / ประเภทการจ้าง / ค้นหาชื่อ แล้วติ๊กเลือก เพื่อคำนวณเฉพาะกลุ่มที่ต้องการ (เพิ่มคนทีหลังได้)
12. ในฐานะ admin ฉันต้องการกด "คำนวณ" แล้วได้สลิปร่างต่อคนที่แสดง: ฐาน, OT รายวัน (ชม. × อัตรา), ค่าสตาฟรายครั้ง (วันที่ · อีเวนต์ · หน้าที่ · อัตรา), เบิ้ลต่างจังหวัดรายครั้ง, รันเนอร์รายวัน, รายการปรับมือ, ยอดสุทธิ
13. ในฐานะ admin ฉันต้องการเห็นคำเตือนในสลิปเมื่อเช็คอินในงวดยังไม่มี check-out / ไม่มีหน้าที่ / ไม่มีอีเวนต์ เพื่อแก้ก่อนปิดงวด
14. ในฐานะ admin ฉันต้องการแก้ข้อมูลต้นทางของเช็คอินจากในสลิปได้เลย (เวลาเข้า-ออก, หน้าที่, ติ๊กต่างจังหวัด, เพิ่มเช็คอินที่ลืม) แล้วกดคำนวณใหม่
15. ในฐานะ admin ฉันต้องการพิมพ์ตัวเลขทับบรรทัดที่ระบบคำนวณพร้อมเหตุผลสั้นๆ และเห็นค่าเดิมเทียบ เพื่อจัดการกรณีพิเศษ (OT พิเศษ, อัตราเฉพาะคน) โดยการคำนวณใหม่ไม่ทับค่าที่แก้ไว้
16. ในฐานะ admin ฉันต้องการกรอกยอดรันเนอร์ต่อวัน (แถวขึ้นให้อัตโนมัติทุกวันที่มีหน้าที่รันเนอร์ พร้อมจำนวนเช็คอินของวันนั้น) และระบบไม่ให้ปิดงวดถ้ายังไม่กรอก
17. ในฐานะ admin ฉันต้องการเพิ่ม/ลบรายการปรับมือ (ชื่อ + จำนวน ±) ในสลิปร่าง เพื่อใส่โบนัส หัก ประกันสังคม ภาษี ฯลฯ
18. ในฐานะ admin ฉันต้องการปิดงวดทีละสลิป และมีปุ่ม "ปิดงวดที่เหลือทั้งหมด" เพื่อไม่ต้องรอคนที่ข้อมูลยังไม่พร้อม
19. ในฐานะ admin ฉันต้องการกด "จ่ายแล้ว" ต่อสลิป (บันทึกวันเวลา/ผู้กด) เพื่อติดตามว่าโอนแล้ว
20. ในฐานะเจ้าของกิจการ ฉันต้องการให้สลิปที่ปิดงวดแล้ว**แก้ตัวเลขไม่ได้และลบไม่ได้แม้เป็น admin** โดยถูกปฏิเสธที่ฐานข้อมูล
21. ในฐานะ admin ฉันต้องการลบสลิปร่าง (เอาคนออกจากงวด) ได้

### พนักงาน
22. ในฐานะพนักงาน ฉันต้องการเข้า `/salary` แล้วเห็นเฉพาะสลิปของตัวเองที่ปิดงวดแล้ว เรียงตามงวด พร้อมสถานะจ่ายแล้ว/รอจ่าย
23. ในฐานะพนักงาน ฉันต้องการเปิดสลิปดู breakdown ทุกบรรทัด และดาวน์โหลด PDF ที่มีชื่อ ธนาคาร งวด รายการ ยอดสุทธิ
24. ในฐานะพนักงาน ฉันต้องการได้รับแจ้งเตือนในกระดิ่งเมื่อสลิปถูกปิดงวด พร้อมลิงก์เปิดสลิป
25. ในฐานะพนักงาน ฉัน**ไม่**ต้องการเห็นสลิปหรือค่าตั้งค่าของคนอื่น และไม่เห็นสลิปร่างของตัวเอง

### หนังสือรับรองเงินเดือน
26. ในฐานะพนักงาน ฉันต้องการสร้างร่าง "หนังสือรับรองเงินเดือน" ในโมดูลเอกสารโดยระบบเติมชื่อ, เลขบัตรประชาชน, ตำแหน่ง, แผนก, วันเริ่มงาน, เงินเดือนฐาน ให้จากข้อมูลของฉันเอง กรอกเองแค่แบรนด์และวัตถุประสงค์ แล้วส่ง admin อนุมัติ
27. ในฐานะ admin ฉันต้องการอนุมัติหนังสือรับรองแล้วได้เลขที่ `BRAND-SC-YYMM-NNNN` และ PDF จดหมายหัวแบรนด์ที่มียอดเป็นตัวเลขและตัวอักษรไทย พร้อมลายเซ็นผู้อนุมัติ
28. ในฐานะผู้ใช้ทั่วไป ฉันต้องการเห็นรายการ "มีอะไรใหม่" อธิบายโมดูลเงินเดือนเมื่อ ship

## Implementation Decisions

### โมดูลและเส้นทาง
- module key `salary` — เพิ่มใน `lib/nav-config.ts` (กลุ่ม "เงินเดือน" ไอคอน `Wallet` ถัดจาก finance) และ `proxy.ts::MODULE_ROUTES` (`salary: ['/salary']`); admin auto-grant ทั้งใน `(authenticated)/layout.tsx` และ `proxy.ts` ตาม pattern `documents`
- เมนู: สลิปของฉัน `/salary` · งวดคำนวณ `/salary/runs` (adminOnly) · ตั้งค่า `/salary/settings` (adminOnly)
- หน้าเสริม: `/salary/[slipId]` (เจ้าของเห็นเฉพาะ finalized/paid; admin เห็นทุกสถานะ + แก้ไขเมื่อ draft), `/salary/runs/[runId]` (admin)
- PDF: `/api/pdf/salary/[slipId]` (nodejs runtime, `requireAuth`, เจ้าของ-หรือ-admin, render สดจาก DB) ใช้ฟอนต์/formatter ชุดเดียวกับใบสำคัญจ่าย
- ตาม pattern เดิม: `page.tsx` (server, `requireAuth()`) + `*-view.tsx` (client) + `actions.ts` ของโมดูล; หน้า admin ตรวจ role ใน page.tsx เพิ่มจาก proxy

### สิทธิ์ (2 role: `admin` / อื่นๆ) — ต้องมี module `salary`
| การกระทำ | user | admin |
|---|---|---|
| เห็นสลิป | ของตัวเอง เฉพาะ finalized/paid | ทุกคน ทุกสถานะ |
| ตั้งค่า / rate card / โปรไฟล์เงินเดือน | ❌ | ✅ |
| เปิดงวด / เลือกคน / คำนวณ / แก้มือ / ปิดงวด / จ่ายแล้ว | ❌ | ✅ |
| แก้เช็คอินจากในสลิป | ❌ | ✅ (reuse `adminCheckIn`/`adminEditCheckin`) |
| ติ๊กหน้าที่ตอนเช็คอินของตัวเอง | ✅ | ✅ |
| แก้/ลบสลิปที่ปิดงวดแล้ว | ❌ | ❌ (DB บังคับ) |

### Schema (migration เดียว `supabase/migrations/20260828_create_salary_module.sql`)
- `staff_checkins` เพิ่ม: `duties text[] NOT NULL DEFAULT '{}'` (รหัสหน้าที่), `out_of_province boolean NOT NULL DEFAULT false`, `province text`, `district text`
- `salary_duties`: `code text PK` (slug คงที่ เช่น `onsite_staff`), `name_th`, `rate numeric NOT NULL DEFAULT 0`, `pay_mode text CHECK IN ('per_checkin','manual_daily')`, `is_active`, `sort_order` — seed: `onsite_staff` ออกงานสตาฟ 700 · `deliver_booth` ส่งโฟโต้บูธ 150 · `collect_booth` เก็บโฟโต้บูธ 150 · `drive_booth` ขับรถออกบูธ 300 · `runner` รันเนอร์ (manual_daily, rate 0) — code ห้ามเปลี่ยนหลัง deploy (ถูกอ้างใน `staff_checkins.duties` และ snapshot ในสลิป)
- `salary_profiles`: `user_id uuid PK → profiles ON DELETE CASCADE`, `employment_type text NOT NULL DEFAULT 'fulltime' CHECK IN ('fulltime','freelance')`, `base_salary numeric NOT NULL DEFAULT 0`, `work_start time NOT NULL DEFAULT '10:00'`, `work_end time NOT NULL DEFAULT '19:00'`, `ot_rate numeric NOT NULL DEFAULT 0`, `position text`, `start_date date`, `updated_at`, `updated_by` — แยกตารางจาก `profiles` เพราะ `/users/page.tsx` ทำ `select('*')` ส่งทั้งแถวลง client (ไม่อยากให้ข้อมูลเงินติดไปทุกที่ที่อ่าน profiles)
- ค่าตั้งค่าระบบใช้ `app_settings` เดิม (key-value): `salary_cutoff_day` (default `25`), `salary_out_of_province_rate` (default `300`) — ไม่สร้างตารางใหม่
- `salary_runs`: `id`, `period_key text UNIQUE` (`YYYY-MM` ของเดือนที่งวดใช้ชื่อ), `period_start date`, `period_end date`, `note`, `created_by`, `created_at` — งวดละ 1 แถว เพิ่มคนเข้างวดได้เรื่อยๆ (กันจ่ายซ้ำด้วย `UNIQUE(run_id, user_id)` บนสลิป)
- `salary_slips`: `id`, `run_id → salary_runs ON DELETE CASCADE`, `user_id → profiles`, `status text CHECK IN ('draft','finalized','paid') DEFAULT 'draft'`, `employment_type` (snapshot), `base_salary numeric` (snapshot), `lines jsonb NOT NULL DEFAULT '[]'`, `adjustments jsonb NOT NULL DEFAULT '[]'`, `warnings jsonb NOT NULL DEFAULT '[]'`, `total numeric NOT NULL DEFAULT 0`, `computed_at`, `finalized_at`, `finalized_by`, `paid_at`, `paid_by`, `created_at`, `updated_at`, `UNIQUE(run_id, user_id)`
  - `lines[]` = `{ key, kind: 'ot'|'site'|'oop'|'runner', date, checkin_id?, duty?, label, hours?, computed_amount, amount, override_note? }` — `key` เสถียร (`kind:date[:checkin_id[:duty]]`) ใช้จับคู่ตอนคำนวณใหม่เพื่อคง `amount`/`override_note` ที่แก้มือ; `amount = null` = ยังไม่กรอก (รันเนอร์)
  - `adjustments[]` = `{ id, label, amount }` (± ได้)
  - ponytail: JSONB แทนตารางบรรทัด — สลิปคือ snapshot อ่านทั้งก้อนเสมอ ไม่ query ข้ามบรรทัด
- **DB trigger** บน `salary_slips`: BEFORE UPDATE ถ้า `OLD.status IN ('finalized','paid')` ห้ามเปลี่ยนคอลัมน์อื่นนอกจาก `status` (ไป `paid` เท่านั้น), `paid_at`, `paid_by`, `updated_at`; BEFORE DELETE ถ้า status ≠ draft → RAISE — ครอบคลุม service role (pattern เดียวกับ `documents`)
- `notifications`: type ใหม่ `salary_finalized`, reference_type `salary_slip` (CHECK ถูกผ่อนไว้แล้วใน migration documents)
- RLS: เปิดตาม pattern repo (service role ผ่าน; `salary_profiles`/`salary_slips` ไม่มี policy ให้ anon/authenticated อ่าน) — สิทธิ์จริงบังคับใน server actions + trigger

### เครื่องคำนวณ (`app/(authenticated)/salary/compute.ts` — pure function ไม่แตะ DB)
`computeSlip({ profile, checkins, duties, oopRate, periodStart, periodEnd, previousLines })` → `{ lines, warnings, total }`
1. **ขอบเขตเช็คอิน**: ประจำ = `office` + `onsite`; ฟรีแลนซ์ = `onsite` เท่านั้น; ไม่นับ `remote`; นับตามวันที่ (Bangkok) ของ `checked_in_at` ในช่วง `[periodStart, periodEnd]`
2. **OT ต่อวัน**: รวมช่วง `[checked_in_at, checked_out_at]` ของวันนั้นให้ไม่ซ้อนกัน (merge intervals) → นับนาทีที่อยู่นอก `[work_start, work_end]` ของวันนั้น (ก่อนเริ่มและหลังเลิก รวมส่วนที่ข้ามเที่ยงคืน) → ปัดลงบล็อก 30 นาที, < 30 นาที = 0 → `hours = blocks/2`, `computed_amount = hours × ot_rate` → 1 บรรทัด `ot` ต่อวันที่มี OT; เช็คอินที่ไม่มี `checked_out_at` ไม่นับ OT + ใส่ `warnings`
3. **ค่าสตาฟ**: ต่อเช็คอิน `onsite` × ต่อหน้าที่ที่ `pay_mode = per_checkin` → บรรทัด `site` `computed_amount = duty.rate` (อัตรา ณ เวลาคำนวณ — snapshot); เช็คอิน onsite ที่ `duties` ว่าง → `warnings`
4. **เบิ้ลต่างจังหวัด**: ต่อเช็คอิน `onsite` ที่ `out_of_province = true` → บรรทัด `oop` `computed_amount = oopRate` (งาน 2 วัน 2 เช็คอิน = 2 บรรทัด — admin เอาติ๊กออกเองถ้านับครั้งเดียว)
5. **รันเนอร์**: ทุกวันที่มีเช็คอิน onsite ที่มีหน้าที่ `pay_mode = manual_daily` → 1 บรรทัด `runner` ต่อวัน `computed_amount = 0`, `amount = null` (label บอกจำนวนเช็คอิน) — admin กรอก
6. **คง override**: บรรทัดใหม่ที่ `key` ตรงกับ `previousLines` ที่มี `override_note` หรือเป็น `runner` ที่กรอกแล้ว → ใช้ `amount`/`override_note` เดิม; บรรทัดเดิมที่ไม่มีใน chunk ใหม่หายไป
7. **ยอด**: `total = (fulltime ? base_salary : 0) + Σ (amount ?? computed_amount) + Σ adjustments.amount` — `amount = null` ให้นับ 0 แต่ **ห้ามปิดงวด** ถ้ายังมี null
8. ไม่คิดตามส่วนเมื่อเข้า/ออกกลางงวด, ไม่หักการลา, ไม่คิดประกันสังคม/ภาษี — ใช้รายการปรับมือ

### การเปลี่ยนแปลงในโมดูลเช็คอิน
- ฟอร์มเช็คอิน `onsite`: กล่องติ๊กหน้าที่จาก `salary_duties` ที่ `is_active` (บังคับ ≥ 1; default ติ๊ก `onsite_staff` ถ้ามีบทบาทในอีเวนต์) + ส่ง `duties[]` ใน FormData; ฟอร์ม admin เช็คอินย้อนหลังเพิ่ม duties + จังหวัด/เขต + ติ๊กต่างจังหวัด
- `checkIn` action: หลัง insert ถ้ามี lat/lng → reverse geocode ฝั่ง server ด้วย Nominatim (`/reverse?format=jsonv2&accept-language=th`, header `User-Agent`, timeout 3 วิ, try/catch — ล้มเหลว = ปล่อยว่าง) → เขียน `province`/`district` (map ชื่อจังหวัดให้ตรง `THAI_PROVINCES` ใน `lib/thai-address.ts`; ไม่ตรง = เก็บข้อความดิบ) — ponytail: ไม่มี key, ไม่มี queue; ถ้าโดน rate-limit ค่อยย้ายไป provider มี key
- หน้าประวัติ/รายงานเช็คอิน: แสดง chips หน้าที่ + จังหวัด/เขต + ป้าย "ตจว."; admin แก้ duties/province/out_of_province ได้ผ่าน `adminEditCheckin` (ขยายให้รับฟิลด์ใหม่ + `checked_in_at`/`checked_out_at`)
- **ลบ** `autoCreateExpenseFromCheckin` และจุดเรียกทั้ง 4 (`checkIn` orphan-close, `adminCheckIn`, `checkOut`, `quickCheckoutStale`); ซ่อนส่วน "ค่าสตาฟอัตโนมัติ" ใน `/finance/settings` (`rate-config-view.tsx`) และตั้ง `auto_calc_enabled = 'false'` ใน migration; คง `expense_claims.from_checkin_id` + `backfillCheckinEvents` ไว้สำหรับข้อมูลเก่า

### หนังสือรับรองเงินเดือน (โมดูลเอกสาร)
- `DOC_TYPES.SC`: label "หนังสือรับรองเงินเดือน / Salary Certificate", `party: 'employee'`, `hasItems: false`, `hasAmounts: false`, `requiresApproval: true`, `counter: 'monthly'`, metaFields: `position`, `department`, `start_date` (date), `base_salary` (number), `purpose` (text, required)
- หน้า `/documents/new` เมื่อเลือก SC: เติม party (ชื่อ, เลขบัตร, ที่อยู่ จาก `profiles`) + meta จาก `salary_profiles` ของผู้สร้างเอง; ฟิลด์ที่เติมให้เป็น read-only สำหรับ user (admin แก้ได้) — ถ้ายังไม่มี `salary_profiles` ของคนนั้น → บล็อกพร้อมข้อความให้ติดต่อ admin
- PDF: เพิ่ม `SalaryCertificatePDF` ใน `components/pdf/hr-forms-pdf.tsx` (layout จดหมาย: หัวแบรนด์, เลขที่, วันที่ พ.ศ., ย่อหน้ารับรอง "ขอรับรองว่า {ชื่อ} … ตำแหน่ง … ตั้งแต่ … ได้รับเงินเดือน … บาท ({ตัวอักษรไทย}) … เพื่อ {วัตถุประสงค์}", ช่องลงนามผู้อนุมัติ + ลายเซ็น) ข้อความมาตรฐานใน `documents/hr-texts.ts`

### แจ้งเตือน / Activity log / UI
- แจ้งเตือน `salary_finalized` → เจ้าของสลิป ข้อความ "สลิปเงินเดือนงวด {เดือน} ปิดงวดแล้ว ยอดสุทธิ {x} บาท" ลิงก์ `/salary/[id]`; เพิ่ม category "เงินเดือน" ในกระดิ่ง
- ActionType ใหม่: `UPDATE_SALARY_SETTINGS`, `UPDATE_SALARY_DUTY`, `UPDATE_SALARY_PROFILE`, `CREATE_SALARY_RUN`, `COMPUTE_SALARY_SLIP`, `OVERRIDE_SALARY_LINE`, `FINALIZE_SALARY_SLIP`, `MARK_SALARY_PAID`, `DELETE_SALARY_SLIP`, `UPDATE_CHECKIN_DUTIES`
- UI: shadcn/Tailwind เดิม, ข้อความผ่าน `t()` (th/en), วันที่ พ.ศ.; ตารางสลิปในงวดมีแถบสถานะสี + ไอคอนเตือนเมื่อ `warnings` ไม่ว่าง; แก้มือใช้ popover ต่อบรรทัด (ตัวเลข + เหตุผล บังคับ); ปิดงวดใช้ dialog ยืนยัน; เพิ่ม entry `/whats-new` ใน commit เดียวกัน
- เพิ่ม `salary` ในรายการโมดูลของหน้า `/users` (toggle เดิม)

## Testing Decisions

ไม่มี test runner — ใช้ `npx tsc --noEmit` + script runnable ใน `scripts/` ตามแนวทาง repo

**Seam 1 (หลัก): `computeSlip` pure function** — `scripts/salary-check.ts` ส่วน A รันด้วย `tsx` ไม่ต้องมี DB ใช้ fixture ในไฟล์ ตรวจ:
1. ประจำ: office 09:00–20:30 → OT 2.5 ชม. (ก่อนเริ่ม 1 ชม. + หลังเลิก 1.5 ชม.) × อัตรา
2. ปัดลงบล็อก 30 นาที: หลังเลิก 19:00–19:29 → 0; 19:00–19:59 → 0.5 ชม.
3. รวมช่วงซ้อน: office 10:00–13:00 + onsite 12:30–22:00 วันเดียวกัน → OT 3 ชม. (ไม่นับซ้ำ)
4. ข้ามเที่ยงคืน: onsite 15:00 → 02:00 วันถัดไป → OT 7 ชม. ในวันที่เช็คอิน
5. ฟรีแลนซ์: office check-in ไม่ให้ OT; onsite ให้; ไม่มีบรรทัดฐาน
6. หน้าที่หลายข้อในเช็คอินเดียว (`deliver_booth`+`collect_booth`) → 2 บรรทัด `site` 150+150; onsite ไม่มีหน้าที่ → warning
7. `out_of_province` → บรรทัด `oop` = อัตราใน settings
8. วันที่มี `runner` 3 เช็คอิน → 1 บรรทัด `runner` `amount = null` และ `total` ไม่รวม; ปิดงวดต้องถูกปฏิเสธ (ตรวจใน action ส่วน B)
9. คำนวณใหม่หลัง override: บรรทัด `ot:2026-08-05` แก้เป็น 999 พร้อมเหตุผล → คำนวณใหม่ยังได้ 999; บรรทัดที่ไม่ได้แก้ได้ค่าคำนวณใหม่
10. เช็คอินไม่มี check-out → ไม่มี OT + warning; ค่าสตาฟยังได้
11. ช่วงงวด 26 ก.ค.–25 ส.ค.: เช็คอิน 25 ก.ค. 23:30 ไม่เข้า, 26 ก.ค. 00:30 เข้า, 25 ส.ค. 23:59 เข้า, 26 ส.ค. 00:00 ไม่เข้า

**Seam 2: DB trigger ผ่าน service client** — `scripts/salary-check.ts` ส่วน B (ข้ามอัตโนมัติถ้าไม่มี env) สร้าง run/slip ทดสอบแล้วลบ: UPDATE `lines`/`total` ของสลิป `finalized` → error; UPDATE `status → paid` + `paid_at` → ผ่าน; DELETE สลิป `finalized` → error; DELETE สลิป `draft` → ผ่าน

Prior art: `scripts/doc-control-check.ts`

สิ่งที่ไม่ทดสอบอัตโนมัติ: หน้าตา PDF, UI, ผล reverse geocode (พึ่ง service ภายนอก)

## Acceptance Criteria (lock — ใช้ตัดสินทุกรอบใน loop)

| id | เกณฑ์ | วิธีตรวจ |
|---|---|---|
| AC1 | `npx tsc --noEmit` ไม่มี error เพิ่มจาก baseline ก่อนเริ่ม | รันคำสั่ง เทียบจำนวน error |
| AC2 | `npx tsx scripts/salary-check.ts` ส่วน A ผ่านครบ 11 กรณี | รันคำสั่ง |
| AC3 | migration รันผ่านบน local stack และส่วน B ของ script ผ่าน (trigger ล็อกสลิปที่ปิดงวด) | `supabase db reset` (หรือรัน SQL) + รัน script |
| AC4 | `npm run build` ผ่าน | รันคำสั่ง |
| AC5 | `salary` อยู่ทั้งใน `NAV_GROUPS` และ `MODULE_ROUTES`, admin auto-grant ทั้ง layout และ proxy, `DOC_TYPES.SC` มีอยู่และ `enabled !== false` | grep |
| AC6 | ไม่มีการเรียก `autoCreateExpenseFromCheckin` เหลือในโค้ด | grep = 0 |
| AC7 | มี `UpdateEntry` ใหม่บนสุดของ `whats-new/updates.ts` และ `docs/Project-workflow.md` อัปเดตสถานะ ticket | grep/อ่าน |

`pass_threshold`: 0.85

## Out of Scope

- คิดตามส่วนเมื่อเข้า/ออกกลางงวด, หักการลา, ประกันสังคม, ภาษี หัก ณ ที่จ่าย, กองทุน — ใช้รายการปรับมือ
- ขั้นบันไดรันเนอร์อัตโนมัติ (admin กรอกต่อวัน ตามภาพอ้างอิง)
- อัตราค่าสตาฟเฉพาะคน (ใช้แก้มือทับบรรทัด)
- ผูกเงินเบิกล่วงหน้า (advance) ของโมดูลการเงินเข้าสลิป
- นำเข้าชีตเดิม / คำนวณย้อนหลังก่อนงวดที่เปิดใช้ (admin เติมหน้าที่/จังหวัดของเช็คอินเก่าในงวดแรกเอง)
- พนักงานเห็นประมาณการงวดปัจจุบัน / ค่าตั้งค่าของตัวเอง
- หนังสือรับรองการทำงาน (ไม่ระบุเงินเดือน) — เพิ่มเป็นประเภทใหม่ทีหลังได้
- ส่งออก Excel/ไฟล์โอนเงินธนาคาร, LINE/อีเมล

## Further Notes

- **Assumptions ที่ตัดสินแทน user**: (1) หน้าที่ "เช็คอัพ" ในชีตไม่มีอัตราในภาพ → ไม่ seed; admin เพิ่มเองใน rate card ถ้ามีอัตรา (2) เบิ้ลต่างจังหวัดคิดต่อเช็คอินที่ติ๊ก งานหลายวันให้ admin ติ๊กครั้งเดียว (3) พนักงานแก้หน้าที่เองได้เฉพาะตอนเช็คอิน การแก้ภายหลังเป็นของ admin (4) เปลี่ยนวันตัดรอบมีผลกับงวดที่เปิดใหม่เท่านั้น งวดเดิมเก็บ `period_start/end` ไว้แล้ว (5) reverse geocode ใช้ Nominatim ไม่มี key
- **สิ่งที่ user ต้องทำเอง**: รัน migration บน Supabase SQL Editor; ตั้งค่าโปรไฟล์เงินเดือนทุกคนก่อนเปิดงวดแรก; ปิดใบเบิกค่าสตาฟที่ค้างก่อนวันเปิดใช้ให้จบตาม flow เดิม; เปิด module `salary` ให้ผู้ใช้จาก `/users`
- ลำดับงานที่แนะนำ: migration + compute + check script → เช็คอิน (หน้าที่/จังหวัด/ลบ auto-claim) → settings → runs/slip editor → employee view + PDF → SC ในเอกสาร → nav/proxy/users/notifications/whats-new → tsc/build
