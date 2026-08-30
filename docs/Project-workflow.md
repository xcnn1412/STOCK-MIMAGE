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
- รัน `supabase/migrations/20260830_crm_leads_event_time.sql` บน Supabase SQL Editor (`event_time`, `event_end_time`) ก่อน deploy

## ไทม์ไลน์ (`/jobs/tracking?view=timeline`) — spec: `docs/specs/jobs-tracking-timeline.md`

branch: `main` · เริ่ม 2026-08-30 · glossary: `CONTEXT.md` (ไทม์ไลน์, เลน, แถบงาน)

| # | Ticket | Blocked by | สถานะ |
|---|---|---|---|
| T1 | Seam (TDD): `layoutDay` / `layoutWeek` / `nextJobDate` — เลน งาน→รถ→คนตามแผนก, แถบ exact/no_end/no_time/multi_day, ชั้นซ้อน, สีต่องาน, ธงชน/ยังไม่จัด, ซ่อนคนว่าง + check script | — | [x] 2026-08-30 — layoutDay/layoutWeek/nextJobDate, ~60 asserts, แดง→เขียว |
| T2 | โหมดวัน: ปุ่มสลับ ตาราง\|ไทม์ไลน์ (`?view&date&mode` ใน URL), นำทางวัน + งานถัดไป, กริดชั่วโมง 06–24, แถบสี/ลายทาง/ขอบแดง, คลิกแถบเปิด StaffEditor/เลือกรถ, ซ่อนคนว่าง, มือถือเลื่อนแนวนอน sticky | T1 | [x] 2026-08-30 — timeline-view.tsx + URL state + StaffEditor/VehicleDialog จากแถบ |
| T3 | โหมดสัปดาห์: 7 วัน rolling บล็อกงานต่อวัน ซ่อนบนจอแคบ | T2 | [x] 2026-08-30 — layoutWeek grid, nav ±7, หัววัน→โหมดวัน, ซ่อนบนจอแคบ |
| T4 | เก็บงาน: มีอะไรใหม่, tsc, `/code-review`, commit | T2, T3 | [x] 2026-08-30 — code-review 2 แกน → แก้ 5 บั๊ก + 5 smell, มีอะไรใหม่, tsc/lint/check ผ่าน |

