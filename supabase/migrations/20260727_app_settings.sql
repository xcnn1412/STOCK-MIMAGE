-- ค่าตั้งค่าระบบแบบ key-value (เช่น Meta API token สำหรับดึงผลโพสต์)
-- อ่าน/เขียนผ่าน service role เท่านั้น — เปิด RLS ไว้โดยไม่มี policy = anon เข้าไม่ได้
CREATE TABLE IF NOT EXISTS app_settings (
  key text PRIMARY KEY,
  value text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
