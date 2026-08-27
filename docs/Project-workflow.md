# Project Workflow — สถานะงาน

> single source of truth ของความคืบหน้า (ตาม `docs/loop-engineering.md` ขั้น [6])
> ติ๊ก `[x]` + วันที่ + หมายเหตุสั้นเมื่อเสร็จจริง (verify ด้วยการรันแล้ว)

## โมดูลเอกสาร (`/documents`) — spec: `docs/specs/documents-module.md`

branch: `feat/documents-module` · เริ่ม 2026-08-27

| # | Ticket | Blocked by | สถานะ |
|---|---|---|---|
| 1 | แกนระบบ: schema + เครื่องออกเลข + ต่อโมดูลเข้าแอป + check script | — | [ ] |
| 2 | Tracer bullet: ใบเสนอราคา ร่าง → ส่ง → อนุมัติ → ได้เลข | 1 | [ ] |
| 3 | รายการเอกสาร: ค้นหา ตัวกรอง สิทธิ์การมองเห็น | 2 | [ ] |
| 4 | PDF ใบเสนอราคา (layout การเงิน) | 2 | [ ] |
| 5 | ตั้งค่าแบรนด์ + ตัวนับ | 1 | [ ] |
| 6 | แม่แบบมีเวอร์ชัน + preview | 4, 5 | [ ] |
| 7 | ประเภทการเงินที่เหลือ JO IV TX RC CN PO CT + อ้างอิงเอกสาร | 4, 5 | [ ] |
| 8 | ประเภทจดหมาย/HR DN MM JA IA RS + ออกเลขทันที | 4 | [ ] |
| 9 | หน้ารออนุมัติ + badge + ค้างเกิน 24 ชม. | 2 | [ ] |
| 10 | วงจรหลังออกเลข: ส่งแล้ว / ปิดงาน / VOID | 4 | [ ] |
| 11 | ลายเซ็นในโปรไฟล์ → PDF | 4 | [ ] |
| 12 | แดชบอร์ด | 3 | [ ] |
| 13 | รายงานเลขต่อเนื่อง + มีอะไรใหม่ + tsc ทั้งโปรเจกต์ | 5, 10 | [ ] |

### สิ่งที่ user ต้องทำเอง
- รัน migration `supabase/migrations/20260827_create_documents_module.sql` บน Supabase SQL Editor (เครื่องนี้ไม่มี `exec_sql` RPC / MCP token / supabase CLI link)
- จากนั้นรัน `npx tsx scripts/doc-control-check.ts` เพื่อยืนยันกติกาเลข (concurrency, ห้ามลบ/แก้)
