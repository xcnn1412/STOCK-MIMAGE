-- ช่อง "ลิงก์" ในโครงสร้างโพสต์ (ลิงก์ในตัวโพสต์ หรือ "ลิงก์อยู่คอมเมนต์")
-- music / asset_link เลิกใช้ในฟอร์มแล้ว — คงคอลัมน์ไว้ ไม่ลบข้อมูลเก่า
ALTER TABLE content_posts ADD COLUMN IF NOT EXISTS link text;
