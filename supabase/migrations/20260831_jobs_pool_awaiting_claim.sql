-- ============================================================================
-- พูลงาน (Jobs Pool) — สถานะแรกของใบงาน "รอรับงาน" + ชนิดแจ้งเตือน 'job_pool_new'
--
-- ใบงานถูกสร้างอัตโนมัติเมื่อการ์ด CRM เปลี่ยนเป็น "ตอบรับ" และต้องเกิดมาเป็น
-- "รอรับงาน" เสมอ — createJobsFromLead หยิบแถว is_active ที่ sort_order ต่ำสุด
-- ของ status_graphic / status_onsite มาเป็นสถานะเริ่มต้น จึง seed แถวนี้ให้มี
-- sort_order ต่ำกว่าทุกแถวเดิม
--
-- idempotent: job_settings ไม่มี unique key บน (category, value) จึงกันซ้ำด้วย
-- WHERE NOT EXISTS แทน ON CONFLICT — รันซ้ำได้ไม่เพิ่มแถว
-- ============================================================================

-- 1. สถานะ "รอรับงาน" ของใบงานกราฟิก
INSERT INTO job_settings (category, value, label_th, label_en, color, sort_order, is_active)
SELECT
  'status_graphic', 'awaiting_claim', 'รอรับงาน', 'Awaiting claim', '#64748b',
  COALESCE((SELECT MIN(sort_order) FROM job_settings WHERE category = 'status_graphic'), 1) - 1,
  true
WHERE NOT EXISTS (
  SELECT 1 FROM job_settings
  WHERE category = 'status_graphic' AND value = 'awaiting_claim'
);

-- 2. สถานะ "รอรับงาน" ของใบงานหน้างาน
INSERT INTO job_settings (category, value, label_th, label_en, color, sort_order, is_active)
SELECT
  'status_onsite', 'awaiting_claim', 'รอรับงาน', 'Awaiting claim', '#64748b',
  COALESCE((SELECT MIN(sort_order) FROM job_settings WHERE category = 'status_onsite'), 1) - 1,
  true
WHERE NOT EXISTS (
  SELECT 1 FROM job_settings
  WHERE category = 'status_onsite' AND value = 'awaiting_claim'
);

-- 3. เปิดทางให้แจ้งเตือนชนิด 'job_pool_new'
--    20260827/20260828 ดรอป CHECK ของคอลัมน์ notifications.type ทิ้งไปแล้ว (type เป็น text อิสระ)
--    แต่ฐานที่ยังค้าง constraint เก่าจาก 20260408 จะปฏิเสธ insert แบบเงียบๆ
--    (createNotifications เขียนแค่ console.error) — ดรอปซ้ำให้แน่ใจ
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
