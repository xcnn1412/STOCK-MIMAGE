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
| 5 | #25 | Ship: whats-new (entry + ขั้นงวดสัปดาห์ในคู่มือ) + ติ๊กตารางนี้ + `tsc`/`npm run build` (AC1–AC7) | 2, 3, 4 | [x] 2026-08-28 f599456 (+cfa4c9a whats-new entry ที่ตกจาก CRLF) — AC1 tsc = 7 · AC2 script A ผ่านครบ (A12–A17) · AC3 B1–B17 บน Postgres 17 · AC4 build exit 0 · AC5–AC7 ✓ |

### Code review round (2026-08-28, `/code-review main high` 8 มุม → 2 รอบแก้)
- รอบ 1 (cfa4c9a): เช็คอินที่มีแต่หน้าที่รันเนอร์/ไม่มีหน้าที่ไม่ถูกประทับ `paid_slip_id` (จ่ายซ้ำได้) → เพิ่ม `salary_slips.checkin_ids` เขียนตอนคำนวณ RPC ประทับจาก union · admin แก้/ลบเช็คอินที่จ่ายแล้วได้ → trigger `staff_checkins_guard_paid` (บล็อกคอลัมน์ที่มีผลกับเงิน + DELETE, ผ่อนด้วย GUC เดิม) · กล่องค้างเกิน 60 วันใช้ UTC → วันไทย + `CATCH_UP_DAYS` ใน view · ลบ helper ซ้ำ (bangkokDateOf, shiftDate, catch-up window ×3, KIND_LABEL ×3, todayBangkok ×2) · `SYNC_SALARY_TO_COSTS` ตาม convention · คำว่า "sync" ใน UI → "ส่งเข้าต้นทุน" · whats-new entry ใหม่หายเพราะ replace ไม่ match CRLF
- รอบ 2 (fc41a46): `recalcTotal` บวกฐานในงวดสัปดาห์ (แก้มือครั้งแรกยอดกระโดดทั้งเดือน) → สลิปนอกงวดเดือนเก็บ `base_salary = 0` · เปลี่ยนวันตัดรอบแล้วงวดเดือนทับกัน OT ออฟฟิศจ่ายซ้ำ (office ไม่ถูกประทับ) → คืน overlap guard เฉพาะ monthly-vs-monthly (AC5 แก้ตาม) · backfill ข้ามเช็คอินรันเนอร์ของสลิปเก่า → `salary_backfill_paid_slip_ids()` ประทับทุก onsite ในช่วงงวดของสลิปที่ปิดแล้ว · ตารางเช็คอิน/อีเวนต์ในสลิปไม่ครอบช่วงเก็บตก → ใช้ `selectCheckinsForRun` เดียวกัน + badge "จ่ายในสลิปอื่นแล้ว" · custom > 60 วันตกเช็คอินต้นช่วง → `onsiteFromFor(run) = min(period_start, period_end − 60d)` · จ่ายแล้วทั้งหมด log ต่อสลิป (targetUserId) · autoCompute กลืน error → toast
- ตั้งใจไม่แก้ (ponytail): ปิดงวดที่เหลือทั้งหมด sync ต้นทุนทีละสลิป (N× round-trip; เพดานหลักสิบคน) · `job_cost_items.notes` ไม่มี index · Excel สรุปยอดโอนสร้างฝั่ง server (โมดูลอื่นทำฝั่ง client) · computeSlip ยังกรองเช็คอินซ้ำกับ `selectCheckinsForRun` (A11 lock ไว้) · re-sync ไม่ย้าย `job_event_id` (trigger กันเปลี่ยน event ของเช็คอินที่จ่ายแล้วอยู่แล้ว) · หน้า runs ยิง query ซ้ำหลายรอบ

### สิ่งที่ user ต้องทำเอง (หลัง ship)
- ⚠️ รัน migration **ก่อน deploy** — รายงานเช็คอิน (`/check-in/report`) select `paid_slip_id` แล้ว ถ้า deploy ก่อนรัน SQL รายงานจะว่างทุกคน
- รัน `20260829_salary_weekly_runs.sql` บน prod **ก่อน deploy** (มี backfill `paid_slip_id` ให้สลิปที่ปิดไปแล้ว) แล้วรัน `scripts/salary-trigger-check.sql` ซ้ำ (B1–B14)
- กรอกธนาคาร/เลขบัญชีใน `/users` ให้ฟรีแลนซ์ทุกคนก่อนงวดสัปดาห์แรก (สรุปยอดโอนจะเตือนช่องว่าง)
- สลิปที่ปิดงวดไปก่อน deploy ไม่ถูก sync เข้า Costs อัตโนมัติ — กด "sync ต้นทุนอีกครั้ง" ในสลิปถ้าต้องการ

## หน้าสลิปแบบรายวัน + งานค้าง + เปิดแก้ไขหลังปิดงวด — spec: `docs/specs/salary-slip-daily-ui.md`

branch: `feat/salary-slip-daily-ui` (ยังไม่สร้าง) · วางแผนเสร็จ 2026-08-28 (grill Q1–Q12) · issue #26 (`ready-for-agent`) · ศัพท์ใหม่ใน `CONTEXT.md`: มุมมองรายวัน, งานค้างก่อนปิดงวด, ยอมรับคำเตือน, เปิดแก้ไข, ส่วนต่างการจ่าย

tickets = sub-issues ของ #26 (blocked-by จริงบน GitHub) · baseline `tsc` = 7

| # | Issue | Ticket | Blocked by | สถานะ |
|---|---|---|---|---|
| 1 | #27 | แกน: migration `20260830_salary_slip_reopen.sql` (accepted_warnings, reopen_history, paid_history/paid_total, RPC `reopen_salary_slip`) + `groupSlipByDay`/`pendingItems` + actions (reopenSlip, accept warning, editSlipCheckin/addSlipCheckin/setRunnerAmounts, finalize บล็อกงานค้าง, Costs reconcile) + notification `salary_reopened` + A18–A19, B18–B21 | — | [x] 2026-08-28 74fe94f |
| 2 | #28 | UI เดสก์ท็อป: ตารางรายวันแก้ inline (inline-cells) + ท้ายตาราง + ลบตารางเก่า 3 ไฟล์ | 1 | [x] 2026-08-28 8a3941d |
| 3 | #29 | UI หัว sticky + checklist งานค้าง (กระโดด/ยอมรับ) + dialog เปิดแก้ไข + ประวัติ + ส่วนต่างการจ่าย + PDF | 1, 2 | [x] 2026-08-28 df07214 |
| 4 | #30 | มือถือการ์ดรายวัน + พนักงานอ่านอย่างเดียว + whats-new + build (AC1–AC7) | 2, 3 | [x] 2026-08-28 56b57ee |

### Code review round (2026-08-28, `/code-review main high` 8 มุม → แก้ 1 รอบ d81bdb8)
- เงิน/ข้อมูล: พนักงานเห็นชื่อหน้าที่เป็นโค้ด (listDuties ติด admin gate) → อ่าน salary_duties ตรง · ฟรีแลนซ์เห็นบรรทัดฐานที่ไม่รวมยอด → เก็บฐาน 0 + ซ่อน · เวลาออก ≤ เข้า ถูกตีเป็นข้ามคืนเงียบๆ (OT 23 ชม.) → ถามยืนยันก่อน (ทั้งแก้และเพิ่ม, adminCheckIn รับ checkout_date) · แก้เช็คอินสำเร็จแต่คำนวณล้มแล้ว UI ย้อนค่า → refresh เสมอ + ข้อความชัด · แก้เวลาของเช็คอินที่ยังไม่มีหน้าที่ถูกปฏิเสธ → บังคับหน้าที่เฉพาะตอนตั้งหน้าที่/เปลี่ยนประเภท · สรุปยอดโอนไม่หักยอดที่จ่ายไปแล้วหลังเปิดแก้ → คอลัมน์ due + Excel · สลิปเคยจ่ายแล้วเปิดแก้แล้วลบได้ → บล็อกทั้ง app + trigger (B22) · หน้างวดนับคำเตือนดิบ → pending_count ฝั่ง server · RPC ปิดงวดไม่เช็ครันเนอร์ว่าง → RAISE (B23) · จ่ายแล้วทั้งหมดล้มกลางทาง → ทำต่อ + log + รายงาน failed · ยอมรับคำเตือนใช้ slip เก่าจาก closure → คืน slip จาก server · pending key รันเนอร์รวมวันเดียวกัน → key ต่อบรรทัด · check-in actions อ่านแต่ cookie เก่า → fallback getSessionLight
- Dedupe: bangkokParts / isMissingAmount / isAcceptable / REOPEN_MIN_REASON ใน compute.ts, EMPLOYMENT_LABEL ใน format.ts (ลบ 4 สำเนา), useDayView ใช้ร่วม table/cards; logActivity ครบ (ADD/EDIT_SALARY_CHECKIN, UNACCEPT_SALARY_WARNING, SET_RUNNER_AMOUNTS); index job_cost_items.notes (partial)
- ตั้งใจไม่แก้ (ponytail): guard trigger เป็น blocklist (ไม่กลับเป็น allowlist) · pending check ยังอยู่ฝั่ง app ยกเว้นรันเนอร์ · accepted key อิง date (ย้ายวันแล้วต้องยอมรับใหม่ — ตั้งใจ) · Costs sync คีย์ใน notes (แก้ note ในโมดูลต้นทุนจะทำให้ซ้ำ) · paid_history read-modify-write ฝั่ง app · reloadSlip โหลดเต็มทุกครั้งที่แก้ (เพดานหลักสิบบรรทัด) · table+cards mount พร้อมกัน (CSS toggle) · ไม่ regen database.types · จังหวัด/เขตแก้จากหน้าสลิปไม่ได้แล้ว (ดู/แก้ที่ประวัติเช็คอิน; ตจว. ยังสลับได้ในสลิป)

### สิ่งที่ user ต้องทำเอง (หลัง ship)
- รัน `20260830_salary_slip_reopen.sql` บน prod ก่อน deploy

## หน้าติดตามงาน (`/jobs/tracking`) — spec: `docs/specs/jobs-tracking-ui.md`

branch: `main` · เริ่ม 2026-08-30 · glossary: `CONTEXT.md`

| # | Ticket | Blocked by | สถานะ |
|---|---|---|---|
| 1 | Seam: โมดูล logic บริสุทธิ์ (ความพร้อม/สิ่งที่ยังขาด, กลุ่มช่วงเวลา rolling, นับชิป, งานที่ผ่านแล้ว) + check script รันด้วย tsx | — | [x] 2026-08-30 — tracking-logic.ts + check script ผ่าน (tsx) |
| 2 | Tracer bullet เดสก์ท็อป 7 คอลัมน์: ยุบ Countdown เป็น badge ในช่อง "งาน", แทน checklist ด้วยคอลัมน์ "ความพร้อม" (พร้อม / ขาด: …), ไฮไลต์ 2 ระดับ | 1 | [x] 2026-08-30 — 7 คอลัมน์ + ReadinessCell + แถวเร่งด่วน |
| 3 | ชิปสรุป วันนี้ / 7 วันนี้ / เดือนนี้ (จำนวน · ยังไม่พร้อม) กดกรอง, ซ่อนงานที่ผ่านแล้ว + ปุ่มสลับ, หัวหน้า "งาน N · ยังไม่พร้อม M", empty state | 1 | [x] 2026-08-30 — ชิป 3 อัน + toggle งานที่ผ่านแล้ว + empty state |
| 4 | หัวคั่นกลุ่ม วันนี้ → 7 วันนี้ → 7 วันถัดไป → รายเดือน (พ.ศ.) ภายในกลุ่มเรียงวัน+เวลา | 1 | [x] 2026-08-30 — groupLeads + หัวคั่น "ยังไม่กำหนดวัน" |
| 5 | จัดคนแสดงชื่อเล่น: server ส่ง nickname, ช่องตารางโชว์ชื่อเล่น (fallback ชื่อจริง), popover "ชื่อเล่น \| ชื่อจริง" แยกตำแหน่ง | — | [x] 2026-08-30 — nickname ในช่อง + popover ชื่อเล่น | ชื่อจริง |
| 6 | การ์ดมือถือ (จอ < md) ใช้ Select/Dialog ชุดเดิม แก้ได้ครบ, ชิป+หัวคั่นใช้ร่วม | 2, 3, 4 | [x] 2026-08-30 — การ์ด md:hidden ใช้ JobCell/DesignCell/VehicleCell/SupplierCell ร่วมกับตาราง |
| 7 | เก็บงาน: ลบ key checklist เก่า (`lock_queue`/`on_site`) จาก validation, ตัดคำว่า checklist/ดีล/Countdown จาก UI, มีอะไรใหม่, tsc ทั้งโปรเจกต์ | 2–6 | [x] 2026-08-30 — CHECKLIST_KEYS เหลือ key รถ + กรอง key เก่าตอนโหลด, metadata, มีอะไรใหม่, tsc ไม่เพิ่ม error |
| 8 | ชน/ต่อคิว: seam `getConflicts`/`availabilityOf` (คน+รถ, ช่วงวัน+เวลา, ไม่รู้เวลา=เช็คไม่ได้) + ป้ายในช่องจัดรถ/จัดคน + check script | 1 | [x] 2026-08-30 — getConflicts/availabilityOf + ConflictBadge, check script ผ่าน |
| 9 | จัดคนในแถว: popover เลือกคน+ตำแหน่ง เห็นความว่าง เขียน `event_staff` ของอีเวนต์ที่ผูก (0 อีเวนต์ → สร้างให้, >1 → เลือก) + sync CRM + log | 8 | [x] 2026-08-30 — StaffEditor dialog + assignLeadStaff (auto-create อีเวนต์, sync CRM, log) |

### สิ่งที่ user ต้องทำเอง
- รัน `supabase/migrations/20260830_crm_leads_event_time.sql` และ `20260831_crm_leads_required_roles.sql` บน Supabase SQL Editor ก่อน deploy

## ไทม์ไลน์ (`/jobs/tracking?view=timeline`) — spec: `docs/specs/jobs-tracking-timeline.md`

branch: `main` · เริ่ม 2026-08-30 · glossary: `CONTEXT.md` (ไทม์ไลน์, เลน, แถบงาน)

| # | Ticket | Blocked by | สถานะ |
|---|---|---|---|
| T1 | Seam (TDD): `layoutDay` / `layoutWeek` / `nextJobDate` — เลน งาน→รถ→คนตามแผนก, แถบ exact/no_end/no_time/multi_day, ชั้นซ้อน, สีต่องาน, ธงชน/ยังไม่จัด, ซ่อนคนว่าง + check script | — | [x] 2026-08-30 — layoutDay/layoutWeek/nextJobDate, ~60 asserts, แดง→เขียว |
| T2 | โหมดวัน: ปุ่มสลับ ตาราง\|ไทม์ไลน์ (`?view&date&mode` ใน URL), นำทางวัน + งานถัดไป, กริดชั่วโมง 06–24, แถบสี/ลายทาง/ขอบแดง, คลิกแถบเปิด StaffEditor/เลือกรถ, ซ่อนคนว่าง, มือถือเลื่อนแนวนอน sticky | T1 | [x] 2026-08-30 — timeline-view.tsx + URL state + StaffEditor/VehicleDialog จากแถบ |
| T3 | โหมดสัปดาห์: 7 วัน rolling บล็อกงานต่อวัน ซ่อนบนจอแคบ | T2 | [x] 2026-08-30 — layoutWeek grid, nav ±7, หัววัน→โหมดวัน, ซ่อนบนจอแคบ |
| T4 | เก็บงาน: มีอะไรใหม่, tsc, `/code-review`, commit | T2, T3 | [x] 2026-08-30 — code-review 2 แกน → แก้ 5 บั๊ก + 5 smell, มีอะไรใหม่, tsc/lint/check ผ่าน |

## โฟกัสงาน + ตำแหน่งที่ต้องการ + ลดเลน — spec: `docs/specs/jobs-tracking-focus.md`

branch: `main` · เริ่ม 2026-08-31 · glossary: `CONTEXT.md`

| # | Ticket | Blocked by | สถานะ |
|---|---|---|---|
| F1 | ตำแหน่งที่ต้องการ end-to-end: migration `required_roles`, seam `missingRoles`/`isFullyStaffed`/`getMissing` กติกาใหม่ (TDD), action รับ `required_roles`, component แก้ไขใช้ใน CRM card + หน้าต่างจัดคน, ป้าย "ขาด: จัดคน (ผู้ช่วย 1)" | — | [x] 2026-08-31 — missingRoles/isFullyStaffed/missingLabel + RequiredRolesEditor ×3 + validation |
| F2 | ลดเลน: seam `workloadOf`/`departmentSummary`/`opts.departments` (TDD), ยุบแผนก + auto-expand, ชิปแผนกใน URL, ภาระงานข้างชื่อ, ถอนซ่อนคนว่าง | F1 (ไฟล์ seam เดียวกัน) | [x] 2026-08-31 — departments filter, workloadOf/departmentSummary, ยุบแผนก + ชิป ?dept= + badge |
| F3 | โฟกัสงาน: seam `focusCandidates` (TDD), `?focus=`, แถบเวลาพาดทุกเลน, หัวโฟกัส (มีแล้ว/ขาด + ดินสอตำแหน่ง + เลือกอีเวนต์), กลุ่มตัวเลือก/ไม่ว่าง, คลิกจัดทันที/เมนูตำแหน่ง/เอาออก, freeze ลำดับ, มือถือ | F1, F2 | [x] 2026-08-31 — focusCandidates/focusWindow, ?focus=, DayLane band, quickStaff optimistic |
| F4 | เก็บงาน: มีอะไรใหม่, tsc/eslint, `/code-review`, commit | F3 | [x] 2026-08-31 — code-review 2 แกน → แยก migration, แก้ race/save order/stale focus + seam staffedCounts; tsc/lint/check ผ่าน |

