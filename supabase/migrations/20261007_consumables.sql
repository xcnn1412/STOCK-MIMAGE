-- ============================================================================
-- วัสดุสิ้นเปลืองบนชั้นเก็บของ (v1.36.0) — เทป ถุงพร็อบ ถ่าน ฯลฯ ที่ใช้แล้วหมดไป
--
-- items.quantity ของวัสดุสิ้นเปลือง = ยอดคงเหลือทั้งหมด (บนชั้น + ในกระเป๋า) — ตัวเลขจริงตัวเดียว
-- ยอดเปลี่ยนผ่าน adjust_item_stock() เท่านั้น: UPDATE แบบมีเงื่อนไข + บันทึก stock_movements ในคำสั่งเดียว
-- RPC ไม่แตะ items.status — "ของหมด" คิดจากยอดล้วนๆ
-- เพิ่มค่า out_of_stock ให้ enum item_status (ตัวเลือก "ของหมด" ในฟอร์มอุปกรณ์บันทึกไม่ได้มาตลอด)
--
-- ต้องรันหลัง 20261004_shelves.sql · idempotent: รันซ้ำได้
-- ============================================================================

-- ── 1. enum item_status: เพิ่ม out_of_stock (ครอบไว้ เผื่อฐานที่ status ไม่ใช่ enum) ──
-- ADD VALUE อยู่ใน transaction ได้ (PG ≥ 12) แต่ใช้ค่าใหม่ใน transaction เดียวกันไม่ได้ — ไฟล์นี้ไม่ได้ใช้
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'item_status' AND typtype = 'e') THEN
    ALTER TYPE item_status ADD VALUE IF NOT EXISTS 'out_of_stock';
  END IF;
END $$;

-- ── 2. items: ธงวัสดุสิ้นเปลือง + หน่วยนับ + จำนวนขั้นต่ำ ─────────────────────
ALTER TABLE items ADD COLUMN IF NOT EXISTS is_consumable BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE items ADD COLUMN IF NOT EXISTS unit TEXT;
ALTER TABLE items ADD COLUMN IF NOT EXISTS min_quantity INT CHECK (min_quantity >= 0);

COMMENT ON COLUMN items.is_consumable IS 'วัสดุสิ้นเปลือง — quantity = ยอดคงเหลือ เปลี่ยนผ่าน adjust_item_stock() เท่านั้น';
COMMENT ON COLUMN items.unit          IS 'หน่วยนับของวัสดุสิ้นเปลือง เช่น ม้วน ถุง ก้อน';
COMMENT ON COLUMN items.min_quantity  IS 'เหลือบนชั้น ≤ ค่านี้ = ใกล้หมด (null = ไม่เตือน)';

-- ── 3. stock_movements: ประวัติทุกครั้งที่ยอดเปลี่ยน ───────────────────────────
CREATE TABLE IF NOT EXISTS stock_movements (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id       UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  delta         INT  NOT NULL,
  balance_after INT  NOT NULL CHECK (balance_after >= 0),
  reason        TEXT NOT NULL CHECK (reason IN ('restock', 'use', 'discard', 'adjust')),
  note          TEXT,
  event_id      UUID REFERENCES events(id)   ON DELETE SET NULL,
  kit_id        UUID REFERENCES kits(id)     ON DELETE SET NULL,
  created_by    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- ทิศทางต้องตรงกับเหตุผล: เติม = บวก · เบิกใช้/ตัดทิ้ง = ลบ · ปรับยอด = ไม่เป็นศูนย์
  CONSTRAINT stock_movements_direction CHECK (
    (reason = 'restock' AND delta > 0)
    OR (reason IN ('use', 'discard') AND delta < 0)
    OR (reason = 'adjust' AND delta <> 0)
  )
);

COMMENT ON TABLE  stock_movements        IS 'ความเคลื่อนไหวของวัสดุสิ้นเปลือง — restock เติม · use เบิกใช้ · discard ตัดทิ้ง · adjust ปรับยอด/ยอดตั้งต้น';
COMMENT ON COLUMN stock_movements.kit_id IS 'กระเป๋าที่ตัดยอดตอนปิดงาน (reason = use)';

CREATE INDEX IF NOT EXISTS stock_movements_item_created_idx ON stock_movements (item_id, created_at DESC);

-- งานหนึ่งตัดของชิ้นหนึ่งในกระเป๋าใบหนึ่งได้ครั้งเดียว (กันปิดงานซ้ำตัดซ้ำ)
CREATE UNIQUE INDEX IF NOT EXISTS stock_movements_event_kit_item_use_uidx
  ON stock_movements (event_id, kit_id, item_id)
  WHERE reason = 'use' AND event_id IS NOT NULL AND kit_id IS NOT NULL;

-- อ่าน/เขียนผ่าน service role เท่านั้น (เหมือน shelves) — เปิด RLS ไม่มี policy = anon เข้าไม่ได้
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;

-- ── 4. adjust_item_stock: เปลี่ยนยอด + บันทึกประวัติในคำสั่งเดียว ─────────────────
-- UPDATE มีเงื่อนไขกันยอดติดลบแม้กดพร้อมกันหลายเครื่อง · INSERT ล้ม (ทิศทางผิด / ตัดซ้ำ) = ยอดย้อนกลับทั้งคู่
CREATE OR REPLACE FUNCTION public.adjust_item_stock(
  p_item   UUID,
  p_delta  INT,
  p_reason TEXT,
  p_note   TEXT,
  p_event  UUID,
  p_kit    UUID,
  p_user   UUID
) RETURNS INT
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_balance INT;
BEGIN
  UPDATE items
     SET quantity = quantity + p_delta
   WHERE id = p_item
     AND is_consumable
     AND quantity + p_delta >= 0
  RETURNING quantity INTO v_balance;

  IF v_balance IS NULL THEN
    IF NOT EXISTS (SELECT 1 FROM items WHERE id = p_item AND is_consumable) THEN
      RAISE EXCEPTION 'NOT_CONSUMABLE';
    END IF;
    RAISE EXCEPTION 'INSUFFICIENT_STOCK';
  END IF;

  INSERT INTO stock_movements (item_id, delta, balance_after, reason, note, event_id, kit_id, created_by)
  VALUES (p_item, p_delta, v_balance, p_reason, NULLIF(btrim(p_note), ''), p_event, p_kit, p_user);

  RETURN v_balance;
END $$;

COMMENT ON FUNCTION public.adjust_item_stock(UUID, INT, TEXT, TEXT, UUID, UUID, UUID) IS
  'เปลี่ยนยอดวัสดุสิ้นเปลือง + บันทึก stock_movements — NOT_CONSUMABLE / INSUFFICIENT_STOCK เมื่อไม่ผ่าน · ไม่แตะ items.status';

-- เรียกได้เฉพาะ service role (ดู 20260930_lock_public_access.sql) — ครอบด้วยการเช็ก role เผื่อฐานที่ไม่มี role ของ Supabase
REVOKE ALL ON FUNCTION public.adjust_item_stock(UUID, INT, TEXT, TEXT, UUID, UUID, UUID) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON FUNCTION public.adjust_item_stock(UUID, INT, TEXT, TEXT, UUID, UUID, UUID) FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON FUNCTION public.adjust_item_stock(UUID, INT, TEXT, TEXT, UUID, UUID, UUID) FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.adjust_item_stock(UUID, INT, TEXT, TEXT, UUID, UUID, UUID) TO service_role;
  END IF;
END $$;
