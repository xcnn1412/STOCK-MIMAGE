-- Soft delete: admin ลบผู้ใช้จาก /users (ไม่ลบแถวจริง)
-- ตั้ง deleted_at + is_blocked=true พร้อมกัน → gate เดิม (proxy/login/auth) ปิดการเข้าใช้ให้เอง ไม่ต้องแก้ gate
-- หน้า /users กรอง deleted_at IS NULL ออก; กู้คืน = set deleted_at=null, is_blocked=false
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
