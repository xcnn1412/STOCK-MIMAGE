-- ============================================================================
-- เพิ่มประเภทเอกสาร 'EL' (จดหมายภายนอก)
-- CHECK ของ documents.doc_type เป็นรายการตายตัว (ขยายล่าสุดใน 20260828_add_sc_doc_type.sql)
-- ถ้าไม่ขยาย INSERT ของ EL จะโดนปฏิเสธที่ฐานข้อมูล
-- ============================================================================

ALTER TABLE documents
  DROP CONSTRAINT IF EXISTS documents_doc_type_check;

ALTER TABLE documents
  ADD CONSTRAINT documents_doc_type_check
  CHECK (doc_type IN (
    'QT','JO','IV','TX','RC','CN','PO','CT','DN','MM','EL','JA','IA','RS','SC'));
