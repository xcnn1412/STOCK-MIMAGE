-- ยกเลิกอีเวนต์ (cancelEvent / restoreEvent) — v1.74.0
-- รันซ้ำได้ทุกคำสั่ง (IF NOT EXISTS)
-- หมายเหตุ: 'cancelled' มีใน enum event_status อยู่แล้วบน prod (มี 6 แถวที่ตั้งตรงในฐานข้อมูล)
--           คำสั่ง ADD VALUE จึงเป็น no-op บน prod — ใส่ไว้ให้ฐานข้อมูลใหม่/สำเนาครบเท่านั้น
ALTER TYPE event_status ADD VALUE IF NOT EXISTS 'cancelled';

ALTER TABLE events ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;
ALTER TABLE events ADD COLUMN IF NOT EXISTS cancelled_by uuid REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE events ADD COLUMN IF NOT EXISTS cancel_reason text;
