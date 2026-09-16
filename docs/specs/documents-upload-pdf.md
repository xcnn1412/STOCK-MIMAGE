# เอกสารอัปโหลด (PDF) — ประเภทเอกสาร `UP`

สถานะ: แผนล็อกแล้ว 2026-09-17 · ใช้กับ loop วางแผน → ลงมือ → ตรวจ (CLAUDE.md) · ต่อยอดจาก `documents-module.md`

## Problem

พนักงานมีเอกสารที่ทำใน Word/โปรแกรมอื่นอยู่แล้ว (สัญญา หนังสือ แบบฟอร์ม) และต้องการนำเข้าระบบเอกสาร
ให้ได้เลขที่เอกสาร ผ่านการอนุมัติ และมีหัว/ท้ายกระดาษของแบรนด์ โดยไม่ต้องพิมพ์ใหม่ในระบบ
การแปลง .docx → PDF ให้เหมือน Word ต้องใช้ LibreOffice/บริการภายนอก จึงให้ผู้ใช้ **บันทึกเป็น PDF จาก Word เอง**
แล้วระบบประทับหัว/ท้ายกระดาษ เลขที่เอกสาร เลขหน้า และลายน้ำให้

## ข้อตัดสินใจ (ล็อก)

| เรื่อง | ตัดสินใจ | เหตุผล |
|---|---|---|
| รูปแบบ | ประเภทเอกสารใหม่ `UP` "เอกสารอัปโหลด (PDF)" party `none`, ไม่มีรายการ/ยอด, ต้องอนุมัติ, ตัวนับรายเดือน | เข้าลำดับ ร่าง → ขออนุมัติ → ออกเลข → PDF เหมือนประเภทอื่น |
| ฟิลด์ (meta) | `subject` ชื่อเอกสาร/เรื่อง (text, บังคับ) · `file` ไฟล์ PDF (ชนิดใหม่ `file`, บังคับ) · `stamp_mode` โหมดประทับ (select: `หัวและท้ายกระดาษ` / `เฉพาะหัวกระดาษ` / `เฉพาะท้ายกระดาษ`, ค่าเริ่มต้นตัวแรก) | ไฟล์ที่มีหัวกระดาษของตัวเองเลือก "เฉพาะท้ายกระดาษ" ยังได้เลขที่/เลขหน้า |
| ข้อมูลไฟล์ใน meta | `file` = path ใน storage, `file_name`, `file_size` (bytes), `file_pages` | `isMetaEmpty` ค่าเริ่มต้นเช็ค string ว่าง → `required` ทำงานกับ `file` ได้เลย |
| ที่เก็บไฟล์ | bucket ใหม่ `doc-files` **private** (public=false, allowed_mime_types = application/pdf, file_size_limit 10MB) path `documents/{document_id}/{uuid}.pdf` | `doc-assets` เป็น public read (โลโก้) ใครมี URL เปิดได้ ไม่เหมาะกับเอกสารบริษัท |
| การเข้าถึงไฟล์ | เฉพาะผ่าน `/api/pdf/document/[id]` (ประทับแล้ว) และ `?raw=1` (ต้นฉบับ) ใช้กติกามองเห็นเดิมของ route | ไม่มีลิงก์สาธารณะ |
| วิธีประทับ | react-pdf วาด "ชั้นครอบ" (หัว/ท้าย/ลายน้ำ/บรรทัดยกเลิก) ด้วยฟอนต์ THSarabunNew ชุดเดิม → pdf-lib ประกอบ: หน้าใหม่ขนาดเท่าหน้าเดิม วาดหน้าเดิมย่อลง แล้ววาดชั้นครอบทับ | pdf-lib วาดอักษรไทยเองเสี่ยงสระ/วรรณยุกต์ลอย; เพิ่ม dependency ตัวเดียว (`pdf-lib`) |
| กันทับเนื้อหา | แถบบน 70pt (ถ้ามีหัว) / ล่าง 40pt (ถ้ามีท้าย) ไม่มีแถบ = 12pt; scale = (h − top − bottom) / h ใช้ค่าเดียวทั้งกว้าง/สูง จัดกลางแนวนอน | ไม่บังคับให้ไฟล์ต้นทางเว้นขอบ |
| หน้าแนวนอน / ขนาดต่างกัน | ชั้นครอบสร้างทีละหน้าตามขนาดหน้าเดิม (`<Page size={[w,h]}>`) | รองรับไฟล์ผสม |
| ขนาดไฟล์ | ≤ 8MB | server action รับได้ 10MB (`serverActions.bodySizeLimit`) |
| อัปโหลด | server action `uploadDocumentFile(id, formData)` ด้วย service client (แอปไม่ใช้ Supabase Auth ฝั่ง client) | ตาม pattern `uploadBrandLogo` |
| คัดลอก/ลบ | `duplicateDocument` คัดลอก object ไปยัง path ของเอกสารใหม่ (`storage.copy`) · `deleteDraft` ลบ object (best-effort) | สำเนาไม่พังเมื่อลบต้นฉบับ |
| preview แม่แบบ | ประเภท `UP` ประทับลงหน้า A4 เปล่า | admin เห็นหน้าตาหัว/ท้ายได้จากหน้าตั้งค่า |
| Activity log | `UPLOAD_DOCUMENT_FILE` | ActionType ต้อง exhaustive ตาม CLAUDE.md |

## ขั้นตอน (เรียงตามลำดับ)

1. **Spike / check script** `scripts/doc-stamp-check.ts`: สร้าง PDF ต้นทาง 2 หน้า (หน้าหนึ่งแนวนอน) ด้วย react-pdf → ประทับ 3 โหมด → assert `%PDF`, จำนวนหน้าเท่าเดิม, เขียนไฟล์ลง `OUT_DIR` (env, ค่าเริ่มต้น os temp) เหมือน `doc-pdf-check.ts`
2. **ฐานราก**: `npm i pdf-lib` · migration `supabase/migrations/20260918_add_up_doc_type.sql` (ขยาย CHECK `documents_doc_type_check` เพิ่ม `UP` + สร้าง bucket `doc-files` private, ไม่สร้าง policy สำหรับ anon/authenticated — service role เท่านั้น) · `DOC_TYPES.UP` ใน `doc-types.ts` + `MetaField.type` เพิ่ม `'file'` · `UPLOAD_DOCUMENT_FILE` ใน `lib/logger.ts`
3. **ตัวประทับ**: `lib/pdf-stamp.ts` (`stampPdf({ source: Uint8Array | null, doc, brand, template, mode }) → Uint8Array`; `source = null` = หน้า A4 เปล่า 1 หน้า) + `components/pdf/stamp-chrome-pdf.tsx` (react-pdf: N หน้า ขนาดตามหน้าเดิม; หัว = โลโก้ (PNG/JPG) ชื่อแบรนด์ ที่อยู่ โทร/อีเมล + เส้นคั่น; ท้าย = ซ้าย เลขที่/เลขร่าง + วันที่ไทย, กลาง ข้อความท้ายจากแม่แบบ, ขวา หน้า i/N; ลายน้ำ "ร่าง / DRAFT" เมื่อไม่มี doc_no, "ยกเลิก / VOID" เมื่อ void + บรรทัด "ยกเลิกเมื่อ … เหตุผล …")
4. **Actions** (`documents/actions.ts`): `uploadDocumentFile` ตรวจ mime `application/pdf` + magic bytes `%PDF` + ≤ 8MB + `PDFDocument.load` สำเร็จ (ไฟล์ล็อกรหัส/เสีย → error ไทย) → upload → ลบไฟล์เก่าถ้ามี → merge meta (`file`, `file_name`, `file_size`, `file_pages`) ลง DB → log → คืน `{ file, file_name, file_size, file_pages }` ให้ client merge เข้า state (เพราะ `saveDraft` เขียน meta ทั้งก้อนจาก state ฝั่ง client) · สิทธิ์เหมือน `saveDraft` (เจ้าของ/admin, สถานะใน `EDITABLE_STATUSES`) · แก้ `duplicateDocument` / `deleteDraft`
5. **ฟอร์ม/มุมมองอ่าน**: `MetaFieldInput` เพิ่มเคส `file` (input type=file accept=application/pdf → เรียก action → แสดงชื่อ ขนาด จำนวนหน้า ปุ่มเปลี่ยนไฟล์; แสดง error จาก validation ใต้ช่อง) · `MetaFieldRead` เพิ่มเคส `file` (ชื่อ ขนาด หน้า + ลิงก์ "เปิดไฟล์ต้นฉบับ" → `/api/pdf/document/{id}?raw=1`) · ส่ง `docId` ลงไปถึง `MetaFieldInput`/`MetaFieldRead` ตามที่จำเป็น
6. **Routes**: `[id]/route.ts` ถ้า `doc_type === 'UP'` → download จาก `doc-files` → `stampPdf` → ส่งกลับ (`?raw=1` ส่งต้นฉบับ, สิทธิ์เดียวกัน, ไม่มีไฟล์ → 404 "ยังไม่ได้แนบไฟล์") · `preview/route.ts` ถ้า `UP` → `stampPdf({ source: null, … })`
7. **ปิดงาน**: `UP` ในกลุ่ม "ทั่วไป" ของ `new-document-view.tsx` และกลุ่ม "ส่งมอบ/จดหมาย" ของ `documents-view.tsx` · whats-new (tag `ใหม่`, module `เอกสาร`, ภาษาผู้ใช้) · spec `documents-module.md` เพิ่มแถว `UP` และย้าย "เก็บไฟล์ PDF ลง storage" ออกจาก Out of Scope · `package.json` → `1.11.0` · `npx tsc --noEmit` · eslint ไฟล์ที่แก้

## เกณฑ์ตรวจรับ (ล็อก — Critic ตรวจเฉพาะรายการนี้)

| id | เกณฑ์ (ผ่าน/ไม่ผ่านชัดเจน) |
|---|---|
| AC1 | migration เพิ่ม `'UP'` ใน `documents_doc_type_check` และสร้าง bucket `doc-files` public=false รับเฉพาะ `application/pdf` |
| AC2 | `DOC_TYPES.UP` มีฟิลด์ `subject` (text, required), `file` (file, required), `stamp_mode` (select 3 ตัวเลือก) และ `UP` อยู่ใน `TYPE_GROUPS` ทั้งหน้าสร้างและตัวกรองรายการ |
| AC3 | `uploadDocumentFile` ปฏิเสธ: ไม่ใช่ PDF (mime หรือ magic bytes), > 8MB, เปิดด้วย pdf-lib ไม่ได้ — ด้วยข้อความไทย; อนุญาตเฉพาะเจ้าของ/admin และสถานะใน `EDITABLE_STATUSES`; log `UPLOAD_DOCUMENT_FILE` |
| AC4 | ส่งขออนุมัติ/ออกเลขโดย `meta.file` ว่างถูกบล็อก (ผ่าน `validateForIssue` เดิม) และฟอร์มแสดง error ใต้ช่องไฟล์ |
| AC5 | PDF จาก `/api/pdf/document/[id]` ของ `UP`: จำนวนหน้าเท่าต้นฉบับ; หัว/ท้ายตาม `stamp_mode`; ลายน้ำ "ร่าง" เมื่อไม่มี doc_no และ "ยกเลิก" เมื่อ void; ท้ายกระดาษมี เลขที่/เลขร่าง และ "หน้า i / N" |
| AC6 | `?raw=1` คืนไฟล์ต้นฉบับ (`application/pdf`); ผู้ไม่มีสิทธิ์ได้ 404 ทั้งแบบประทับและ raw; ยังไม่แนบไฟล์ได้ 404 พร้อมข้อความ |
| AC7 | preview แม่แบบของ `UP` ตอบ 200 `application/pdf` 1 หน้า |
| AC8 | `duplicateDocument` ได้ไฟล์ของตัวเอง (path ใหม่ใต้ id ใหม่); `deleteDraft` ลบ object และไม่ error เมื่อไม่มีไฟล์ |
| AC9 | `npx tsx scripts/doc-stamp-check.ts` ผ่าน 3 โหมด (จำนวนหน้าเท่าเดิม, %PDF); `npx tsx scripts/doc-pdf-check.ts` ยังผ่านครบทุกประเภท (รวม `UP`) |
| AC10 | `npx tsc --noEmit` ไม่มี error ใหม่ (error เดิมมีเฉพาะใน `checkupdate/check-update-view.tsx` และ `finance/[id]/claim-detail-view.tsx`); eslint ไฟล์ที่แก้/สร้างไม่มี error |
| AC11 | whats-new entry บนสุด, แถว `UP` ใน spec, `package.json` = `1.11.0`, migration อยู่ใน `supabase/migrations/` — ทั้งหมดในชุดเดียวกัน |

pass_threshold: 0.85

## ข้อจำกัดที่ยอมรับ

- ไฟล์ > 8MB ต้องบีบอัดก่อน (อัปเกรดทีหลัง: signed upload URL ส่งตรงเข้า storage)
- ลิงก์/ช่องกรอกในไฟล์ต้นทางถูกแบนเป็นภาพนิ่งหลังประทับ (เปิดต้นฉบับได้จาก "เปิดไฟล์ต้นฉบับ")
- migration ต้อง apply ผ่าน `/checkupdate` เหมือนประเภท `EL`

## Out of Scope

- แปลง .docx → PDF ในระบบ (ต้องใช้ LibreOffice/บริการภายนอก)
- ประทับลงไฟล์ประเภทอื่น (รูป, Word) · แก้ไขเนื้อหา PDF · ลายเซ็นดิจิทัล
