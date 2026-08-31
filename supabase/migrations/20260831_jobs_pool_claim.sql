-- ============================================================================
-- พูลงาน (Jobs Pool) — รับงาน / คืนงาน / ข้ามใบงาน / เปลี่ยนคนรับ
--
-- assigned_to เดิมเป็น "คนที่เกี่ยวข้องกับใบงาน" หลายคนได้ จึงบอกไม่ได้ว่าใครคือ
-- ผู้กดรับงาน (กราฟิก = เจ้าของงานออกแบบ, หน้างาน = หัวหน้างานผู้รับผิดชอบ)
-- claimed_by จึงเก็บ "ผู้รับ" ไว้ต่างหาก ส่วน assigned_to ยังถูก sync ตามเดิม
--
-- ข้ามใบงาน = ใบงานออกจากพูลโดยไม่มีผู้รับ พร้อมเหตุผล (status = 'skipped'
-- ซึ่งไม่ต้องมีแถวใน job_settings — groupPoolJobs ตัดออกจากแท็บฝ่ายให้แล้ว)
--
-- idempotent: ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS — รันซ้ำได้
-- ============================================================================

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS claimed_by  UUID REFERENCES profiles(id);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS claimed_at  TIMESTAMPTZ;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS skipped_at  TIMESTAMPTZ;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS skip_reason TEXT;

COMMENT ON COLUMN jobs.claimed_by  IS 'ผู้รับใบงาน (กราฟิก = เจ้าของงานออกแบบ, หน้างาน = หัวหน้างาน) — null = ยังไม่มีผู้รับ';
COMMENT ON COLUMN jobs.claimed_at  IS 'เวลาที่กดรับงานครั้งล่าสุด';
COMMENT ON COLUMN jobs.skipped_at  IS 'เวลาที่ใบงานถูกข้าม — null = ไม่ถูกข้าม';
COMMENT ON COLUMN jobs.skip_reason IS 'เหตุผลที่ข้ามใบงาน (เช่น ลูกค้าออกแบบเอง)';

-- "ใบงานของฉัน" ในพูล — กรองด้วย claimed_by
CREATE INDEX IF NOT EXISTS jobs_claimed_by_idx ON jobs (claimed_by);
