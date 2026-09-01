-- รูปโปรไฟล์ (avatar) — โชว์ในการ์ดอันดับทีม/หน้าโปรไฟล์
-- ไฟล์เก็บใน bucket doc-assets path avatars/{userId} (ไม่สร้าง bucket ใหม่)
-- idempotent: รันซ้ำได้

alter table profiles
  add column if not exists avatar_url text;
