-- ============================================================================
-- เพิ่มประเภทเอกสาร 'SC' (หนังสือรับรองเงินเดือน) — issue #18
-- 20260827_create_documents_module.sql กำหนด CHECK ไว้แค่ 13 รหัส
-- ถ้าไม่ขยาย INSERT ของ SC จะโดนปฏิเสธที่ฐานข้อมูล
-- ============================================================================

ALTER TABLE documents
  DROP CONSTRAINT IF EXISTS documents_doc_type_check;

ALTER TABLE documents
  ADD CONSTRAINT documents_doc_type_check
  CHECK (doc_type IN (
    'QT','JO','IV','TX','RC','CN','PO','CT','DN','MM','JA','IA','RS','SC'));
