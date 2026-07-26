-- หมวด "ตัวอย่าง" — รูปอ้างอิง + ลิงก์วิดีโอ/โพสต์ตัวอย่างการทำงาน
ALTER TABLE content_posts ADD COLUMN IF NOT EXISTS example_images text[] NOT NULL DEFAULT '{}';
ALTER TABLE content_posts ADD COLUMN IF NOT EXISTS example_video_url text;
ALTER TABLE content_posts ADD COLUMN IF NOT EXISTS example_post_url text;
