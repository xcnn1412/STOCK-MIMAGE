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
