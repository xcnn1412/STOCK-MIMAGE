-- ============================================================================
-- ล้างพื้นที่ Supabase Storage ผ่าน SQL Editor (แก้ deadlock: Storage API ถูกล็อกเพราะเกิน quota)
-- รันใน Supabase Dashboard → SQL Editor (session รันเป็น role postgres)
--
-- ⚠️ หมายเหตุสำคัญ:
--   • วิธีนี้ลบเฉพาะ "แถว" ใน storage.objects → พื้นที่ที่ Supabase นับ (quota) ลดลงทันที
--     แต่ไฟล์จริงใน S3 เบื้องหลังจะค้าง (orphan blob) ลบผ่าน API ไม่ได้อีก — ยอมรับได้เพราะเป็นไฟล์ขยะ/เก่า
--   • SET storage.allow_delete_query คือ flag ทางการของ Supabase เองสำหรับอนุญาต SQL delete
--   • หลังรันแล้วพื้นที่ < 1GB → restriction จะปลดใน 2-3 นาที → แล้วค่อยรัน recompress-receipts.mjs ต่อ
-- ============================================================================


-- ══════════════════════════════════════════════════════════════════════════
-- STEP 1 — PREVIEW (ไม่ลบอะไร) รันก่อนเพื่อดูว่าจะลบอะไรบ้าง กี่ไฟล์ กี่ MB
-- ══════════════════════════════════════════════════════════════════════════
WITH targets AS (
  SELECT o.bucket_id, (o.metadata->>'size')::bigint AS bytes,
    CASE
      WHEN o.bucket_id='login_selfies' THEN 'dead-feature'
      WHEN o.bucket_id='checkin-photos' AND o.created_at < now() - interval '30 days' THEN 'checkin>30d'
      ELSE 'orphan'
    END AS reason
  FROM storage.objects o
  WHERE
    o.bucket_id='login_selfies'
    OR (o.bucket_id='checkin-photos' AND (
         o.created_at < now() - interval '30 days'
         OR NOT EXISTS (SELECT 1 FROM (
              SELECT photo_url u FROM staff_checkins UNION ALL
              SELECT checkout_photo_url FROM staff_checkins UNION ALL
              SELECT attachment_url FROM leave_requests) r
            WHERE split_part(r.u,'/checkin-photos/',2)=o.name)))
    OR (o.bucket_id='receipts' AND NOT EXISTS (
         SELECT 1 FROM expense_claims c, LATERAL unnest(
           coalesce(c.receipt_urls,'{}')||coalesce(c.tax_invoice_urls,'{}')||coalesce(c.actual_receipt_urls,'{}')) u
         WHERE split_part(u,'/receipts/',2)=o.name))
    OR (o.bucket_id='item-images' AND NOT EXISTS (
         SELECT 1 FROM items i, LATERAL (
            SELECT CASE WHEN i.image_url LIKE '[%'
              THEN (SELECT array_agg(x) FROM json_array_elements_text(i.image_url::json) x)
              ELSE ARRAY[i.image_url] END AS urls) j, LATERAL unnest(j.urls) u
         WHERE split_part(u,'/item-images/',2)=o.name))
    OR (o.bucket_id='ticket-attachments' AND NOT EXISTS (
         SELECT 1 FROM (
            SELECT unnest(coalesce(attachments,'{}')) u FROM tickets UNION ALL
            SELECT unnest(coalesce(attachments,'{}')) FROM ticket_replies UNION ALL
            SELECT unnest(coalesce(attachments,'{}')) FROM my_job_comments UNION ALL
            SELECT unnest(coalesce(attachments,'{}')) FROM my_ticket_comments) r
         WHERE split_part(r.u,'/ticket-attachments/',2)=o.name))
    OR (o.bucket_id='crm-payment-proofs' AND NOT EXISTS (
         SELECT 1 FROM crm_lead_installments c
         WHERE split_part(c.receipt_url,'/crm-payment-proofs/',2)=o.name))
)
SELECT bucket_id, reason, count(*) AS files, pg_size_pretty(sum(bytes)) AS size
FROM targets GROUP BY bucket_id, reason ORDER BY sum(bytes) DESC;


-- ══════════════════════════════════════════════════════════════════════════
-- STEP 2 — ลบจริง (รันทั้งบล็อกนี้พร้อมกันในครั้งเดียว เพราะ SET ต้องอยู่ session เดียวกับ DELETE)
-- ══════════════════════════════════════════════════════════════════════════
SET storage.allow_delete_query = 'true';

-- 2.1 NULL รูปเช็คอินที่กำลังจะถูกลบ (เก่ากว่า 30 วัน) — กัน UI แสดงรูปเสีย (broken image)
UPDATE staff_checkins s SET photo_url = NULL
WHERE photo_url IS NOT NULL AND EXISTS (
  SELECT 1 FROM storage.objects o WHERE o.bucket_id='checkin-photos'
    AND o.created_at < now() - interval '30 days'
    AND o.name = split_part(s.photo_url,'/checkin-photos/',2));

UPDATE staff_checkins s SET checkout_photo_url = NULL
WHERE checkout_photo_url IS NOT NULL AND EXISTS (
  SELECT 1 FROM storage.objects o WHERE o.bucket_id='checkin-photos'
    AND o.created_at < now() - interval '30 days'
    AND o.name = split_part(s.checkout_photo_url,'/checkin-photos/',2));

UPDATE leave_requests l SET attachment_url = NULL
WHERE attachment_url IS NOT NULL AND EXISTS (
  SELECT 1 FROM storage.objects o WHERE o.bucket_id='checkin-photos'
    AND o.created_at < now() - interval '30 days'
    AND o.name = split_part(l.attachment_url,'/checkin-photos/',2));

-- 2.2 ลบไฟล์: login_selfies(ทั้งหมด) + orphan ทุก bucket + checkin เก่ากว่า 30 วัน
DELETE FROM storage.objects o WHERE
    o.bucket_id='login_selfies'
    OR (o.bucket_id='checkin-photos' AND (
         o.created_at < now() - interval '30 days'
         OR NOT EXISTS (SELECT 1 FROM (
              SELECT photo_url u FROM staff_checkins UNION ALL
              SELECT checkout_photo_url FROM staff_checkins UNION ALL
              SELECT attachment_url FROM leave_requests) r
            WHERE split_part(r.u,'/checkin-photos/',2)=o.name)))
    OR (o.bucket_id='receipts' AND NOT EXISTS (
         SELECT 1 FROM expense_claims c, LATERAL unnest(
           coalesce(c.receipt_urls,'{}')||coalesce(c.tax_invoice_urls,'{}')||coalesce(c.actual_receipt_urls,'{}')) u
         WHERE split_part(u,'/receipts/',2)=o.name))
    OR (o.bucket_id='item-images' AND NOT EXISTS (
         SELECT 1 FROM items i, LATERAL (
            SELECT CASE WHEN i.image_url LIKE '[%'
              THEN (SELECT array_agg(x) FROM json_array_elements_text(i.image_url::json) x)
              ELSE ARRAY[i.image_url] END AS urls) j, LATERAL unnest(j.urls) u
         WHERE split_part(u,'/item-images/',2)=o.name))
    OR (o.bucket_id='ticket-attachments' AND NOT EXISTS (
         SELECT 1 FROM (
            SELECT unnest(coalesce(attachments,'{}')) u FROM tickets UNION ALL
            SELECT unnest(coalesce(attachments,'{}')) FROM ticket_replies UNION ALL
            SELECT unnest(coalesce(attachments,'{}')) FROM my_job_comments UNION ALL
            SELECT unnest(coalesce(attachments,'{}')) FROM my_ticket_comments) r
         WHERE split_part(r.u,'/ticket-attachments/',2)=o.name))
    OR (o.bucket_id='crm-payment-proofs' AND NOT EXISTS (
         SELECT 1 FROM crm_lead_installments c
         WHERE split_part(c.receipt_url,'/crm-payment-proofs/',2)=o.name));

-- 2.3 ดูพื้นที่ที่เหลือ (ต้อง < 1024 MB)
SELECT pg_size_pretty(sum((metadata->>'size')::bigint)) AS total_after,
       count(*) AS objects_left
FROM storage.objects;
