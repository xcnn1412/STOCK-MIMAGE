-- เพจ/แบรนด์ที่จะลงโพสต์ (แต่ละช่องทางมีหลายเพจ)
ALTER TABLE content_posts ADD COLUMN IF NOT EXISTS page text;
