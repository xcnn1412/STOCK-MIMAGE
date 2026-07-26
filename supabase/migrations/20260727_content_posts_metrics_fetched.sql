-- ประทับเวลาการดึงผลลัพธ์อัตโนมัติล่าสุดจากแพลตฟอร์ม
ALTER TABLE content_posts ADD COLUMN IF NOT EXISTS metrics_fetched_at timestamptz;
