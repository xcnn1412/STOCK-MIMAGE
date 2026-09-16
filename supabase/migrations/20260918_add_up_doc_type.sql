-- ============================================================================
-- เพิ่มประเภทเอกสาร 'UP' (เอกสารอัปโหลด PDF)
-- CHECK ของ documents.doc_type เป็นรายการตายตัว (ขยายล่าสุดใน 20260917_add_el_doc_type.sql)
-- ถ้าไม่ขยาย INSERT ของ UP จะโดนปฏิเสธที่ฐานข้อมูล
-- + bucket 'doc-files' แบบ private สำหรับเก็บไฟล์ PDF ต้นฉบับที่ผู้ใช้อัปโหลด
--   (ไม่สร้าง policy ให้ anon/authenticated — เข้าถึงผ่าน service role ใน server action/route เท่านั้น)
-- ============================================================================

ALTER TABLE documents
  DROP CONSTRAINT IF EXISTS documents_doc_type_check;

ALTER TABLE documents
  ADD CONSTRAINT documents_doc_type_check
  CHECK (doc_type IN (
    'QT','JO','IV','TX','RC','CN','PO','CT','DN','MM','EL','JA','IA','RS','SC','UP'));

-- ── Storage bucket (private) ────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('doc-files', 'doc-files', false, 10485760, ARRAY['application/pdf'])
ON CONFLICT (id) DO NOTHING;
