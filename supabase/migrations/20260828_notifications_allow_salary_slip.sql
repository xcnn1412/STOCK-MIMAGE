-- ============================================================================
-- แจ้งเตือน `salary_finalized` → เปิดทาง reference_type = 'salary_slip'
--
-- ทำไมต้องมีไฟล์นี้: 20260827_create_documents_module.sql §8 "ผ่อน CHECK ของ
-- notifications" ดรอป CHECK ของคอลัมน์ `type` ทิ้งจริง (type ใหม่ใส่ได้เลย) แต่
-- **ใส่ CHECK ของ `reference_type` กลับเข้าไปใหม่** ด้วยลิสต์ตายตัวที่ไม่มี
-- 'salary_slip' → insert แจ้งเตือนของโมดูลเงินเดือนจะถูก DB ปฏิเสธ
-- (createNotifications เขียน console.error เฉยๆ = ปิดงวดผ่านแต่เจ้าของสลิปไม่ได้
-- แจ้งเตือน ซึ่งเงียบจนไม่มีใครรู้) — spec §Schema เข้าใจผิดว่า CHECK ถูกผ่อนไว้แล้ว
--
-- รูปแบบเดียวกับ §8 ของ migration เอกสาร: ดรอปตัวเดิมแล้วสร้างใหม่พร้อมค่าที่เพิ่ม
-- ============================================================================
ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS notifications_reference_type_check;

ALTER TABLE notifications
  ADD CONSTRAINT notifications_reference_type_check CHECK (
    reference_type IN (
      'job', 'ticket', 'expense_claim', 'kpi_evaluation', 'crm_lead', 'document', 'salary_slip'
    )
  );
