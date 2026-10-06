-- ============================================================================
-- CRM: เติมสถานะที่ลูกค้าใช้อยู่จริงแต่ไม่มีแถวตั้งค่า + เปลี่ยนค่าสถานะภาษาไทยเป็น 'credit'
--
-- ทำไม:
--  1) ลูกค้า ~1,700 รายอยู่สถานะ 'lead' และ ~200 รายอยู่ 'rejected' แต่ crm_settings ไม่มีแถว kanban_status
--     ของสองค่านี้ → บอร์ดไม่มีคอลัมน์ให้ การ์ดกลุ่มนี้จึงไม่ปรากฏบนบอร์ดเลย (โค้ดมีคอลัมน์สำรองให้แล้ว
--     แต่ควรมีแถวตั้งค่าจริงเพื่อให้มีชื่อไทย/สี/ลำดับที่ถูกต้อง)
--  2) ค่าสถานะ 'รายรับเงินสดย่อย Office' (ชื่อที่แสดง "เครดิต/ยังค้างชำระ") เป็นข้อความไทยมีช่องว่าง
--     ใช้เป็นค่าใน URL/ตัวกรองลำบาก → เปลี่ยนค่าเป็น 'credit' ทุกที่ ชื่อที่แสดงไม่เปลี่ยน
--
-- รันซ้ำได้: insert เฉพาะเมื่อยังไม่มีแถว · update ซ้ำแล้วไม่เจอแถวเดิมก็ไม่ทำอะไร
-- ============================================================================

BEGIN;

INSERT INTO crm_settings (category, value, label_th, label_en, color, sort_order, is_active)
SELECT 'kanban_status', 'lead', 'ลูกค้าใหม่', 'Lead', '#3b82f6', 0, true
WHERE NOT EXISTS (SELECT 1 FROM crm_settings WHERE category = 'kanban_status' AND value = 'lead');

INSERT INTO crm_settings (category, value, label_th, label_en, color, sort_order, is_active)
SELECT 'kanban_status', 'rejected', 'ปฏิเสธ', 'Rejected', '#6b7280', 99, true
WHERE NOT EXISTS (SELECT 1 FROM crm_settings WHERE category = 'kanban_status' AND value = 'rejected');

UPDATE crm_leads SET status = 'credit' WHERE status = 'รายรับเงินสดย่อย Office';
UPDATE crm_activities SET old_status = 'credit' WHERE old_status = 'รายรับเงินสดย่อย Office';
UPDATE crm_activities SET new_status = 'credit' WHERE new_status = 'รายรับเงินสดย่อย Office';
UPDATE crm_settings SET value = 'credit' WHERE category = 'kanban_status' AND value = 'รายรับเงินสดย่อย Office';
-- แท็กเฉพาะสถานะผูกกับค่าสถานะผ่านชื่อหมวด (tag_<status>) — ย้ายตามไปด้วย
UPDATE crm_settings SET category = 'tag_credit' WHERE category = 'tag_รายรับเงินสดย่อย Office';

COMMIT;
