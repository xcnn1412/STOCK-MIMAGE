# Project Workflow — สถานะงาน

> single source of truth ของความคืบหน้า (ตาม `docs/loop-engineering.md` ขั้น [6])
> ติ๊ก `[x]` + วันที่ + หมายเหตุสั้นเมื่อเสร็จจริง (verify ด้วยการรันแล้ว)

## โมดูลเอกสาร (`/documents`) — spec: `docs/specs/documents-module.md`

branch: `feat/documents-module` · เริ่ม 2026-08-27

| # | Ticket | Blocked by | สถานะ |
|---|---|---|---|
| 1 | แกนระบบ: schema + เครื่องออกเลข + ต่อโมดูลเข้าแอป + check script | — | [x] 2026-08-27 a6c4f27 — check script 9/9 ผ่านบน local stack, tsc ไม่เพิ่ม error |
| 2 | Tracer bullet: ใบเสนอราคา ร่าง → ส่ง → อนุมัติ → ได้เลข | 1 | [x] 2026-08-27 53e8fca — ฟอร์ม generic ทุกประเภท + ปุ่ม transition ครบ (รวม void/sent/close ของ ticket 10) |
| 3 | รายการเอกสาร: ค้นหา ตัวกรอง สิทธิ์การมองเห็น | 2 | [x] 2026-08-27 e6b09ac — ตัวกรอง URL-driven + แก้บั๊ก month UTC |
| 4 | PDF ใบเสนอราคา (layout การเงิน) | 2 | [x] 2026-08-27 e6b09ac — PDF 3 layout + watermark/void/ลายเซ็น (รวมตรา VOID ของ ticket 10) |
| 5 | ตั้งค่าแบรนด์ + ตัวนับ | 1 | [x] 2026-08-27 53e8fca — settings/actions.ts แยกไฟล์, ล็อกรหัสหลังออกเลข, กันลด last_number ต่ำกว่าเลขที่ออกแล้ว |
| 6 | แม่แบบมีเวอร์ชัน + preview | 4, 5 | [x] 2026-08-27 — แท็บแม่แบบ, เวอร์ชัน max+1 + rollback, preview route POST /api/pdf/document/preview, doc-rich-text-editor.tsx |
| 7 | ประเภทการเงินที่เหลือ JO IV TX RC CN PO CT + อ้างอิงเอกสาร | 4, 5 | [x] 2026-08-27 — ฟอร์ม/PDF generic ครอบคลุมแล้ว; ตรวจครบ 13 ประเภทใน ticket 8 |
| 8 | ประเภทจดหมาย/HR DN MM JA IA RS + ออกเลขทันที (+ TipTap richtext) | 4 | [x] 2026-08-27 — richtext ในฟอร์ม/หน้าอ่าน + sanitize, PDF loop 13 ประเภท 16/16 ผ่าน (แก้บั๊ก CT richtext ใน PDF) |
| 9 | หน้ารออนุมัติ + badge + ค้างเกิน 24 ชม. | 2 | [x] 2026-08-27 e6b09ac — approvals + sidebar badge |
| 10 | วงจรหลังออกเลข: ส่งแล้ว / ปิดงาน / VOID | 4 | [x] 2026-08-27 — รวมอยู่ใน ticket 2 (ปุ่ม) + 4 (ตรา VOID บน PDF) |
| 11 | ลายเซ็นในโปรไฟล์ → PDF | 4 | [x] 2026-08-27 e6b09ac — อัปโหลดลายเซ็นในโปรไฟล์ ≤400px |
| 12 | แดชบอร์ด | 3 | [x] 2026-08-27 e6b09ac — dashboard Recharts |
| 13 | รายงานเลขต่อเนื่อง + มีอะไรใหม่ + tsc ทั้งโปรเจกต์ | 5, 10 | [x] 2026-08-27 e6b09ac — reports + whats-new entry (tsc รอบสุดท้ายหลัง ticket 6/8) |

### Code review round (2026-08-27)
- `/code-review main high` 8 มุม → แก้แล้ว 12 ข้อ (F1–F12): canTransition แหล่งเดียว, SQL issue รับ `rejected`, session.ts รวม getSession/requireAdmin, editor ตัด mark ที่ PDF ไม่รองรับ, sanitize คำค้น, max series >9999, thai-date โซน Bangkok, badge นับ inline, ลายเซ็น ext ตรงชนิดไฟล์ + bucket doc-assets + พื้นขาว, reports Promise.all, โลโก้ PNG/JPG เท่านั้น, PDF route รับ legacy cookie, admin auto-grant `documents` (layout+proxy)
- ตั้งใจไม่แก้ (ponytail): UI ไทย hardcode ไม่ผ่าน t(); listDocuments select * / dashboard scan ทั้งตาราง (เพดานหลักพันใบ); font/formatter ซ้ำกับ payment-voucher; validation client/server 2 ชุด; per-type flag ใน DOC_TYPES

### สิ่งที่ user ต้องทำเอง
- รัน migration `supabase/migrations/20260827_create_documents_module.sql` บน Supabase SQL Editor (เครื่องนี้ไม่มี `exec_sql` RPC / MCP token / supabase CLI link)
- จากนั้นรัน `npx tsx scripts/doc-control-check.ts` เพื่อยืนยันกติกาเลข (concurrency, ห้ามลบ/แก้)

### 2026-08-27 (หลัง merge)
- ปิดกลุ่มการเงิน 8 ประเภท (QT JO IV TX RC CN PO CT) ชั่วคราวด้วย `enabled: false` ใน DOC_TYPES — เปิดกลับโดยลบ flag
- JA / IA / RS: ฟอร์ม + PDF ตามแบบฟอร์มกระดาษ `docs/document/template/*.pdf` (MetaField เพิ่ม section/checkbox/multiselect/table; renderer `components/pdf/hr-forms-pdf.tsx`; ข้อความ PDPA ใน `documents/hr-texts.ts`)

## โมดูลเงินเดือน (`/salary`) — spec: `docs/specs/salary-module.md`

branch: `feat/salary-module` · วางแผนเสร็จ 2026-08-28 (grill Q1–Q29) · issue #9 (`ready-for-agent`) · ศัพท์: `CONTEXT.md` · ADR-0001

tickets = sub-issues ของ #9 (tracer bullets, blocked-by จริงบน GitHub) · baseline `tsc` ก่อนเริ่ม: 7 errors (finance/[id]/claim-detail-view.tsx เดิม)

| # | Issue | Ticket | Blocked by | สถานะ |
|---|---|---|---|---|
| 1 | #10 | Prefactor: เลิกสร้างใบเบิกค่าสตาฟอัตโนมัติจากเช็คอิน (ADR-0001) — ลบฟังก์ชัน + 4 จุดเรียก, ซ่อน UI ค่าสตาฟอัตโนมัติในตั้งค่าการเงิน | — | [x] 2026-08-28 76be26a — grep = 0, tsc = baseline |
| 2 | #11 | แกนคำนวณ: migration ทั้งโมดูล (คอลัมน์เช็คอิน, `salary_duties`+seed, `salary_profiles`, `salary_runs`, `salary_slips`+trigger, app_settings keys) + `computeSlip` (pure) + `scripts/salary-check.ts` A/B | — | [x] 2026-08-28 4d5140d + 443ba82 — script A 11/11; migration + trigger ตรวจบน Postgres 17 (container) ด้วย `scripts/salary-trigger-check.sql` B1–B11 ผ่าน (local stack เต็มรูปแบบ start ไม่ได้: Docker content store เสียหลังดิสก์ C: เต็ม) |
| 3 | #12 | เช็คอินติ๊กหน้าที่ (บังคับ ≥1) + reverse geocode จังหวัด/เขต + dropdown + ฟอร์ม admin ย้อนหลัง + ประวัติ/รายงานแสดง + ขยาย `adminEditCheckin` | 1, 2 | [x] 2026-08-28 62f9e80 + 9db8f22 — geocode ทดสอบจริง กทม./นนทบุรี/ชลบุรี ถูกต้อง |
| 4 | #13 | โมดูล `/salary` (nav/proxy/auto-grant/toggle ใน `/users`) + `/salary/settings`: วันตัดรอบ, อัตรา ตจว., rate card CRUD, โปรไฟล์เงินเดือนต่อคน + `/salary` empty state | 2 | [x] 2026-08-28 c1e8d46 — nav label อยู่ใน `lib/dictionary.ts` (ไม่ใช่ lib/i18n), toggle ใน /users มาจาก `ALL_MODULES` อัตโนมัติ |
| 5 | #14 | งวดคำนวณ: เปิดงวด (เดือนละ 1) → เลือกคน (แผนก/ประเภทการจ้าง/ชื่อ) → คำนวณ → สลิปร่าง + warnings + หน้าอ่านสลิป (admin) + ลบสลิปร่าง | 3, 4 | [x] 2026-08-28 6f17841 — หน้าอ่านสลิปมี access rule (admin ทุกใบ / เจ้าของเฉพาะปิดงวดแล้ว) ตั้งแต่ใบนี้ |
| 6 | #15 | แก้สลิปร่าง: แก้มือทับ (เหตุผลบังคับ) / รันเนอร์รายวัน / รายการปรับมือ / แก้เช็คอินจากในสลิป → คำนวณใหม่คง override | 5 | [x] 2026-08-28 70b2c68 — slip view เรียก adminEditCheckin/adminCheckIn ของโมดูลเช็คอินตรงๆ แล้ว recompute |
| 7 | #16 | ปิดงวดทีละสลิป + ปิดที่เหลือทั้งหมด (บล็อกถ้ารันเนอร์ null) + จ่ายแล้ว + แจ้งเตือน `salary_finalized` + logActivity | 6 | [x] 2026-08-28 06171cb — พบ CHECK `notifications_reference_type_check` ปิดอยู่ → เพิ่ม migration `20260828_notifications_allow_salary_slip.sql` (ต้องรันบน prod ด้วย) |
| 8 | #17 | พนักงาน: `/salary` (finalized/paid ของตัวเอง) + `/salary/[id]` (เจ้าของ-หรือ-admin) + PDF `/api/pdf/salary/[id]` | 7 | [x] 2026-08-28 4cb0585 — route ใช้ getSlipForView เป็นกติกาสิทธิ์เดียว; `scripts/salary-pdf-check.ts` 2/2 |
| 9 | #18 | หนังสือรับรองเงินเดือน `SC` ในโมดูลเอกสาร: prefill จากโปรไฟล์เงินเดือน (read-only สำหรับ user) + อนุมัติ → เลขที่ + PDF จดหมาย | 4 | [x] 2026-08-28 4d4ab7a — ต้องรัน migration `20260828_add_sc_doc_type.sql` ด้วย (ขยาย CHECK doc_type); doc-pdf-check 17/17 |
| 10 | #19 | Ship: whats-new + สอบทาน i18n + ติ๊ก Project-workflow + `tsc`/`npm run build` ทั้งโปรเจกต์ (AC1–AC7) | 3, 8, 9 | [x] 2026-08-28 — whats-new 2 entries (54218af); AC1 tsc = 7 (baseline) · AC2 script A 11/11 · AC3 migration + trigger บน Postgres 17 ผ่าน · AC4 `npm run build` exit 0 · AC5 grep ครบ · AC6 = 0 · AC7 ✓; i18n: nav label ผ่าน dictionary, UI ในโมดูล hardcode ไทย (ตาม pattern documents) |

### Code review round (2026-08-28)
- `/code-review main high` 8 มุม → แก้แล้ว 13 ข้อ: SC ไม่ทับอีเมล/วันเกิดเป็น null (ปลดออกจาก locked keys) · SC บล็อกตั้งแต่ต้นถ้าโปรไฟล์ไม่มีชื่อ / อ่านโปรไฟล์ไม่ได้ · `adminEditCheckin` เอาหน้าที่ออกหมดได้ (`duties_set`) + บังคับ onsite ต้องมีหน้าที่ + ไม่ค้าง ตจว. เมื่อเปลี่ยนประเภทออกจาก onsite · `validateDutyCodes` รับเฉพาะหน้าที่ที่เปิดใช้ · เช็คอิน fail-open ถ้ายังไม่มี rate card (กัน outage ถ้า migration ยังไม่รัน) · logActivity ใน `adminEditCheckin` (`UPDATE_CHECKIN_DUTIES`) และ `updateMyCheckinLocation` (`UPDATE_CHECKIN_LOCATION` ใหม่) · `createSalaryRun` กันช่วงงวดทับกันเมื่อเปลี่ยนวันตัดรอบ · `computeSlips` ไม่กลืน error ของ profiles · compute เตือน `override_dropped` เมื่อค่าที่แก้มือจับคู่บรรทัดใหม่ไม่ได้ (+ เคส A9b ใน script) · ตัวเลือกอีเวนต์ในไดอะล็อกเพิ่ม/แก้เช็คอินจากสลิป · toast แจ้งเตือนลิงก์ไปสลิป (+ document) · migration แจ้งเตือนดรอป CHECK ของ `type` แบบ dynamic (เครื่องที่ยังไม่รัน migration เอกสาร) · howto 4 จุด + whats-new ไม่พูดถึงใบเบิกอัตโนมัติ/rate config เดิมอีก
- **เปิดไว้ให้ตัดสินใจ (ธุรกิจ)**: โมดูลต้นทุน (Costs) เคยได้ค่าสตาฟต่ออีเวนต์จากใบเบิกที่อนุมัติ → หลัง ADR-0001 ต้นทุนสตาฟต่ออีเวนต์จะเป็น 0 สำหรับงานใหม่ จนกว่าจะมี sync จากสลิปที่ปิดงวด → `job_cost_items` (ยังไม่ทำ — ดู ADR-0001 Consequences)
- ตั้งใจไม่แก้ (ponytail): `salary/session.ts` ซ้ำกับ `documents/session.ts` (ควรย้ายเข้า lib/auth.ts เป็นงานแยก); label/formatter ซ้ำ (EMPLOYMENT_LABEL ×4, fmtMoney, periodLabel, Bangkok-date helpers); requireAdmin ซ้ำ 2–4 ครั้งต่อ request; finalizeRemaining/computeSlips log ทีละแถว (เพดานหลักสิบคน); UI ในโมดูลไทย hardcode ไม่ผ่าน t() (ตาม documents); ลิงก์แจ้งเตือนใช้ไม่ได้ถ้าผู้ใช้ยังไม่ได้เปิด module `salary` (ตามการตัดสินใจ Q19 — admin ต้องเปิดก่อน); geocode รอสูงสุด 3 วิในเส้นทางเช็คอิน (ไม่มี cache/queue)

### สิ่งที่ user ต้องทำเอง (หลัง ship)
- ถ้า prod ยังไม่ได้รัน `20260827_create_documents_module.sql` (โมดูลเอกสาร) ต้องรันก่อน — `20260828_add_sc_doc_type.sql` แก้ตาราง `documents` ซึ่งมาจากไฟล์นั้น
- รัน migration 3 ไฟล์บน Supabase SQL Editor **ตามลำดับ** (ทุกไฟล์ idempotent รันซ้ำได้): `20260828_create_salary_module.sql` → `20260828_add_sc_doc_type.sql` → `20260828_notifications_allow_salary_slip.sql` — จากนั้นวาง `scripts/salary-trigger-check.sql` ใน SQL Editor รันเพื่อยืนยัน guard (ทุกบรรทัด NOTICE ต้องขึ้น ok)
- ⚠️ ต้องรัน migration ก่อน deploy โค้ด: เช็คอิน "ไปหน้างาน" ของทุกคนจะถูกบล็อกจนกว่าจะมีตาราง `salary_duties` (ฟอร์มขึ้น "ยังไม่มีรายการหน้าที่หน้างานในระบบ")
- กรอกโปรไฟล์เงินเดือนทุกคนใน `/salary/settings` และเปิด module `salary` ให้ผู้ใช้จาก `/users` ก่อนเปิดงวดแรก (หนังสือรับรองเงินเดือนก็ต้องมีโปรไฟล์เงินเดือนก่อน)
- ปิดใบเบิกค่าสตาฟที่ค้างอยู่ก่อนวันเปิดใช้ให้จบตาม flow การเงินเดิม (ระบบไม่สร้างใบใหม่จากเช็คอินอีก)
- เครื่องนี้: Docker Desktop content store เสียหลังดิสก์ C: เต็มระหว่าง pull image (`supabase start` ใช้ไม่ได้) — ถ้าจะใช้ local stack อีกต้อง reset Docker data (ลบ image/volume ทั้งหมด รวม volume `supabase_db_stock` เดิม) และเคลียร์พื้นที่ C: (`docker_data.vhdx` 16.45 GB)

## งวดรายสัปดาห์ + จ่ายเช็คอินครั้งเดียว + sync ต้นทุน — spec: `docs/specs/salary-weekly-runs.md`

branch: `feat/salary-weekly-runs` · วางแผนเสร็จ 2026-08-28 (grill รอบสอง Q1–Q16) · issue #20 (`ready-for-agent`) · ศัพท์ใหม่ใน `CONTEXT.md`: งวดคำนวณ 3 ชนิด, จ่ายได้ครั้งเดียว, เก็บตก, สรุปยอดโอน, สลิปค่าจ้าง

tickets = sub-issues ของ #20 (tracer bullets, blocked-by จริงบน GitHub) · baseline `tsc` วัดก่อนเริ่ม = 7 (intern work committed 12fcc35 ก่อนเริ่ม)

| # | Issue | Ticket | Blocked by | สถานะ |
|---|---|---|---|---|
| 1 | #21 | แกน: migration `20260829_salary_weekly_runs.sql` (`salary_runs.kind`, `staff_checkins.paid_slip_id`, `costs_synced_at`, RPC `finalize_salary_slip`, backfill) + `computeSlip(runKind)` + `selectCheckinsForRun`/`lastFinishedWeek` + `createSalaryRun` ทุกชนิด (ถอด overlap check) + finalize ผ่าน RPC + script A12–A14/A16, B12–B14 | — | [x] 2026-08-28 fb76cf4 — script A ผ่านครบ (A12–A14, A16), B1–B14 ผ่านบน Postgres 17 container, migration รันซ้ำได้ |
| 2 | #22 | UI งวดสัปดาห์: `getRunSuggestions` แบนเนอร์ "เปิดและคำนวณ" + กล่องค้างเกิน 60 วัน + ฟอร์มเลือกชนิดงวด + ติ๊กคนให้เอง + "สลิปค่าจ้าง" ทั่ว UI/PDF/แจ้งเตือน + badge จ่ายแล้วในเช็คอิน | 1 | [x] 2026-08-28 135e530 — tsc = 7, badge จ่ายแล้วใน history + report ของเช็คอิน |
| 3 | #23 | สรุปยอดโอน (ชื่อ/ธนาคาร/เลขบัญชี/ยอด/สถานะ) + Excel (`xlsx`) + `markAllPaid` | 1 | [x] 2026-08-28 bd0bbd9 — Excel สร้างฝั่ง server ส่ง base64 (รายงานเช็คอินเดิมเป็น client-side) |
| 4 | #24 | Sync ต้นทุน: `salary/costs-sync.ts` (`costsRowsForSlip` pure + `syncSlipToCosts` → `job_cost_items` staff, auto `importEventFromStock`, notes key idempotent, runner เฉพาะวันอีเวนต์เดียว) + ปุ่ม sync อีกครั้ง + A15 + อัปเดต ADR-0001 | 1 | [x] 2026-08-28 bd0bbd9 — A15 ผ่าน; โหลดเช็คอินด้วย `paid_slip_id` (ไม่ใช่แค่ id ในบรรทัด) เพื่อให้รันเนอร์หาอีเวนต์เจอ; trigger เดิมอนุญาต `costs_synced_at` อยู่แล้ว ไม่ต้องมี migration เพิ่ม |
| 5 | #25 | Ship: whats-new (entry + ขั้นงวดสัปดาห์ในคู่มือ) + ติ๊กตารางนี้ + `tsc`/`npm run build` (AC1–AC7) | 2, 3, 4 | [ ] |

### สิ่งที่ user ต้องทำเอง (หลัง ship)
- รัน `20260829_salary_weekly_runs.sql` บน prod **ก่อน deploy** (มี backfill `paid_slip_id` ให้สลิปที่ปิดไปแล้ว) แล้วรัน `scripts/salary-trigger-check.sql` ซ้ำ (B1–B14)
- กรอกธนาคาร/เลขบัญชีใน `/users` ให้ฟรีแลนซ์ทุกคนก่อนงวดสัปดาห์แรก (สรุปยอดโอนจะเตือนช่องว่าง)
- สลิปที่ปิดงวดไปก่อน deploy ไม่ถูก sync เข้า Costs อัตโนมัติ — กด "sync ต้นทุนอีกครั้ง" ในสลิปถ้าต้องการ
