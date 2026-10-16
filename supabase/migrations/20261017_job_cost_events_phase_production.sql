-- เพิ่ม phase "production" (โครงสร้าง / ผลิต) ให้ job_cost_events
-- ใช้เป็นถังต้นทุนของ lead ที่ไม่ใช่วันงาน เช่น ค่าวัสดุโครงสร้างที่ซื้อผ่านระบบจัดซื้อ
-- รันซ้ำได้
ALTER TABLE job_cost_events
  DROP CONSTRAINT IF EXISTS job_cost_events_phase_check;

ALTER TABLE job_cost_events
  ADD CONSTRAINT job_cost_events_phase_check
  CHECK (phase IS NULL OR phase IN ('setup', 'main', 'teardown', 'delivery', 'production', 'other'));
