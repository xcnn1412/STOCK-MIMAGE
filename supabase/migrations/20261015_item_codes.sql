-- ============================================================================
-- รหัสอุปกรณ์ประจำชิ้น (items.code) — v1.56.0
--
-- ทุกอุปกรณ์มีรหัสที่ระบบออกให้เอง ไม่ซ้ำ รูปแบบ MI-000001 (เลขรันจาก sequence)
-- แยกจาก serial_number (เลขจากผู้ผลิต กรอกเองได้/ว่างได้) — ใช้ทำบาร์โค้ด/สติกเกอร์ติดของ
--
-- ของเดิมได้รหัสย้อนหลังเรียงตามวันที่สร้าง (แล้วชื่อ) ให้เลขไม่สลับกันระหว่างรันซ้ำ
-- idempotent: รันซ้ำได้ — เติมเฉพาะแถวที่ยังไม่มีรหัส
-- ============================================================================

CREATE SEQUENCE IF NOT EXISTS items_code_seq;

ALTER TABLE items ADD COLUMN IF NOT EXISTS code TEXT;

-- backfill ของเดิมตามลำดับสร้าง — ให้เลขด้วย row_number (nextval ใน UPDATE ไม่รับประกันลำดับ) แล้วเลื่อน sequence ตาม
DO $$
DECLARE base BIGINT; cnt BIGINT;
BEGIN
  SELECT last_value - CASE WHEN is_called THEN 0 ELSE 1 END INTO base FROM items_code_seq;
  UPDATE items i
  SET code = 'MI-' || lpad((base + o.n)::text, 6, '0')
  FROM (SELECT id, row_number() OVER (ORDER BY created_at, name, id) AS n FROM items WHERE code IS NULL) o
  WHERE i.id = o.id;
  GET DIAGNOSTICS cnt = ROW_COUNT;
  IF cnt > 0 THEN PERFORM setval('items_code_seq', base + cnt); END IF;
END $$;

ALTER TABLE items ALTER COLUMN code SET DEFAULT 'MI-' || lpad(nextval('items_code_seq')::text, 6, '0');
ALTER TABLE items ALTER COLUMN code SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS items_code_key ON items (code);

COMMENT ON COLUMN items.code IS 'รหัสอุปกรณ์ที่ระบบออกให้ (MI-000001) ไม่ซ้ำ แก้ไม่ได้ — ใช้ทำบาร์โค้ด · serial_number คือเลขผู้ผลิต';
