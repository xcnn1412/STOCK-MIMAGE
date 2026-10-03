#!/usr/bin/env bash
# ตรวจ migration วัสดุสิ้นเปลือง (20261007_consumables.sql) บน postgres:17 ชั่วคราว — ไม่แตะฐาน prod
# รัน: bash scripts/consumables-sql.check.sh (จาก root ของ repo, ต้องมี docker)
# ขั้นตอน: schema จำลอง prod → รัน migration 2 รอบ (รอบแรกเป็น transaction เดียวแบบ SQL editor) → assert AC1 + AC2 (a)–(g)
# ส่ง SQL ผ่าน stdin ไม่ mount volume (path มีอักษรไทย + Git Bash แปลง path)
set -euo pipefail

cd "$(dirname "$0")/.."
MIGRATION="supabase/migrations/20261007_consumables.sql"
NAME="consumables-check-$$-$RANDOM"

cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT

docker run -d --name "$NAME" -e POSTGRES_HOST_AUTH_METHOD=trust postgres:17 >/dev/null

# เซิร์ฟเวอร์ชั่วคราวตอน init ฟังแค่ unix socket — รอจนต่อผ่าน TCP ได้ = ตัวจริงพร้อมแล้ว
for _ in $(seq 1 60); do
  if docker exec "$NAME" psql -h 127.0.0.1 -U postgres -tAc 'select 1' >/dev/null 2>&1; then break; fi
  sleep 1
done
docker exec "$NAME" psql -h 127.0.0.1 -U postgres -tAc 'select 1' >/dev/null

psql_run() { docker exec -i "$NAME" psql -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -U postgres "$@"; }

# ── schema จำลอง prod: item_status ยังไม่มี out_of_stock, role ของ Supabase ─────────
psql_run <<'SQL'
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE TYPE item_status  AS ENUM ('available', 'in_use', 'maintenance', 'lost', 'damaged');
CREATE TYPE event_status AS ENUM ('upcoming', 'active', 'completed');
CREATE TABLE profiles (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), full_name TEXT);
CREATE TABLE events   (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT NOT NULL, status event_status DEFAULT 'upcoming');
CREATE TABLE kits     (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT NOT NULL, event_id UUID REFERENCES events(id));
CREATE TABLE items (
  id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name     TEXT NOT NULL,
  status   item_status NOT NULL DEFAULT 'available',
  quantity INT NOT NULL DEFAULT 1
);
CREATE TABLE kit_contents (
  id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kit_id   UUID REFERENCES kits(id),
  item_id  UUID REFERENCES items(id),
  quantity INT NOT NULL DEFAULT 1
);
SQL

# ── migration 2 รอบ ────────────────────────────────────────────────────────────
psql_run --single-transaction < "$MIGRATION"
psql_run < "$MIGRATION"
echo "migration: รัน 2 รอบผ่าน"

# ── AC1: โครงสร้าง ────────────────────────────────────────────────────────────
psql_run <<'SQL'
DO $$
BEGIN
  ASSERT (SELECT count(*) FROM information_schema.columns
           WHERE table_name = 'items' AND column_name IN ('is_consumable', 'unit', 'min_quantity')) = 3,
    'items ขาดคอลัมน์ใหม่';
  ASSERT to_regclass('public.stock_movements') IS NOT NULL, 'ไม่มีตาราง stock_movements';
  ASSERT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.stock_movements'::regclass), 'stock_movements ไม่ได้เปิด RLS';
  ASSERT (SELECT count(*) FROM pg_policies WHERE tablename = 'stock_movements') = 0, 'stock_movements มี policy';
  ASSERT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE tablename = 'stock_movements'
       AND indexdef LIKE 'CREATE UNIQUE INDEX%(event_id, kit_id, item_id)%'
       AND indexdef LIKE '%reason = ''use''%'
       AND indexdef LIKE '%event_id IS NOT NULL%'
       AND indexdef LIKE '%kit_id IS NOT NULL%'
  ), 'ไม่มี unique partial index (event_id, kit_id, item_id) WHERE use';
  ASSERT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
                  WHERE t.typname = 'item_status' AND e.enumlabel = 'out_of_stock'), 'item_status ไม่มี out_of_stock';
  -- รันซ้ำไม่สร้าง constraint ซ้ำ
  ASSERT (SELECT count(*) FROM pg_constraint WHERE conrelid = 'items'::regclass AND contype = 'c') = 1,
    'items มี check constraint ซ้ำ';
END $$;
SQL
echo "AC1: ผ่าน"

# ── AC2: adjust_item_stock ────────────────────────────────────────────────────
psql_run <<'SQL'
INSERT INTO profiles (id) VALUES ('00000000-0000-0000-0000-0000000000a1');
INSERT INTO events (id, name) VALUES ('00000000-0000-0000-0000-0000000000e1', 'งานทดสอบ');
INSERT INTO kits (id, name) VALUES ('00000000-0000-0000-0000-0000000000c1', 'กระเป๋าทดสอบ');
INSERT INTO items (id, name, status, quantity, is_consumable, unit) VALUES
  ('00000000-0000-0000-0000-000000000001', 'เทปผ้า', 'available', 0, true, 'ม้วน'),
  ('00000000-0000-0000-0000-000000000002', 'ขาตั้ง', 'in_use', 5, false, NULL);

CREATE FUNCTION pg_temp.qty(p UUID) RETURNS INT LANGUAGE sql AS $$ SELECT quantity FROM items WHERE id = p $$;
CREATE FUNCTION pg_temp.moves(p UUID) RETURNS BIGINT LANGUAGE sql AS $$ SELECT count(*) FROM stock_movements WHERE item_id = p $$;

DO $$
DECLARE
  tape CONSTANT UUID := '00000000-0000-0000-0000-000000000001';
  stand CONSTANT UUID := '00000000-0000-0000-0000-000000000002';
  ev   CONSTANT UUID := '00000000-0000-0000-0000-0000000000e1';
  kit  CONSTANT UUID := '00000000-0000-0000-0000-0000000000c1';
  usr  CONSTANT UUID := '00000000-0000-0000-0000-0000000000a1';
  b INT;
  failed BOOLEAN;
  msg TEXT;
BEGIN
  -- (a) +N เพิ่มยอด และ balance_after = ยอดใหม่
  b := adjust_item_stock(tape, 10, 'restock', 'ยอดตั้งต้น', NULL, NULL, usr);
  ASSERT b = 10, '(a) คืนยอดผิด';
  ASSERT pg_temp.qty(tape) = 10, '(a) quantity ไม่เพิ่ม';
  ASSERT (SELECT balance_after FROM stock_movements WHERE item_id = tape ORDER BY created_at DESC LIMIT 1) = 10,
    '(a) balance_after ไม่ตรงยอดใหม่';
  ASSERT pg_temp.moves(tape) = 1, '(a) ไม่มี movement';

  -- (b) ตัดเกินยอด → exception, ยอดเดิม, ไม่มี movement เพิ่ม
  failed := false;
  BEGIN
    PERFORM adjust_item_stock(tape, -11, 'use', NULL, NULL, NULL, usr);
  EXCEPTION WHEN OTHERS THEN failed := true; msg := SQLERRM;
  END;
  ASSERT failed AND msg = 'INSUFFICIENT_STOCK', '(b) ตัดเกินยอดไม่ล้ม: ' || coalesce(msg, '-');
  ASSERT pg_temp.qty(tape) = 10, '(b) quantity เปลี่ยน';
  ASSERT pg_temp.moves(tape) = 1, '(b) มี movement เพิ่ม';

  -- (c) ไม่ใช่วัสดุสิ้นเปลือง → exception
  failed := false; msg := NULL;
  BEGIN
    PERFORM adjust_item_stock(stand, 1, 'restock', NULL, NULL, NULL, usr);
  EXCEPTION WHEN OTHERS THEN failed := true; msg := SQLERRM;
  END;
  ASSERT failed AND msg = 'NOT_CONSUMABLE', '(c) ไม่ใช่วัสดุสิ้นเปลืองแต่ไม่ล้ม: ' || coalesce(msg, '-');
  ASSERT pg_temp.qty(stand) = 5 AND pg_temp.moves(stand) = 0, '(c) ยอด/ประวัติเปลี่ยน';

  -- (d) เหตุผลกับทิศทางไม่ตรงกัน → ล้ม ยอดไม่เปลี่ยน
  failed := false;
  BEGIN PERFORM adjust_item_stock(tape, -1, 'restock', NULL, NULL, NULL, usr); EXCEPTION WHEN OTHERS THEN failed := true; END;
  ASSERT failed, '(d) restock ติดลบไม่ล้ม';
  failed := false;
  BEGIN PERFORM adjust_item_stock(tape, 1, 'use', NULL, NULL, NULL, usr); EXCEPTION WHEN OTHERS THEN failed := true; END;
  ASSERT failed, '(d) use เป็นบวกไม่ล้ม';
  failed := false;
  BEGIN PERFORM adjust_item_stock(tape, 1, 'discard', 'เสีย', NULL, NULL, usr); EXCEPTION WHEN OTHERS THEN failed := true; END;
  ASSERT failed, '(d) discard เป็นบวกไม่ล้ม';
  failed := false;
  BEGIN PERFORM adjust_item_stock(tape, 0, 'adjust', NULL, NULL, NULL, usr); EXCEPTION WHEN OTHERS THEN failed := true; END;
  ASSERT failed, '(d) adjust 0 ไม่ล้ม';
  failed := false;
  BEGIN PERFORM adjust_item_stock(tape, 1, 'gift', NULL, NULL, NULL, usr); EXCEPTION WHEN OTHERS THEN failed := true; END;
  ASSERT failed, '(d) เหตุผลแปลกปลอมไม่ล้ม';
  ASSERT pg_temp.qty(tape) = 10 AND pg_temp.moves(tape) = 1, '(d) ยอด/ประวัติเปลี่ยนหลังล้ม';

  -- (e) 'use' ซ้ำ (งาน, กระเป๋า, ของ) เดิม → ล้ม ยอดไม่เปลี่ยน
  b := adjust_item_stock(tape, -3, 'use', NULL, ev, kit, usr);
  ASSERT b = 7 AND pg_temp.qty(tape) = 7, '(e) ตัดครั้งแรกไม่ได้';
  failed := false; msg := NULL;
  BEGIN
    PERFORM adjust_item_stock(tape, -2, 'use', NULL, ev, kit, usr);
  EXCEPTION WHEN unique_violation THEN failed := true;
  END;
  ASSERT failed, '(e) ตัดซ้ำไม่ล้มด้วย unique_violation';
  ASSERT pg_temp.qty(tape) = 7 AND pg_temp.moves(tape) = 2, '(e) ตัดซ้ำแล้วยอดเปลี่ยน';
  -- เบิกใช้ทั่วไป (ไม่ผูกงาน/กระเป๋า) ซ้ำได้
  PERFORM adjust_item_stock(tape, -1, 'use', NULL, NULL, NULL, usr);
  PERFORM adjust_item_stock(tape, -1, 'use', NULL, NULL, NULL, usr);
  ASSERT pg_temp.qty(tape) = 5, '(e) เบิกใช้ทั่วไปซ้ำไม่ได้';

  -- ปรับยอดลงจนเหลือ 0 ได้
  b := adjust_item_stock(tape, -5, 'adjust', 'นับได้ 0', NULL, NULL, usr);
  ASSERT b = 0 AND pg_temp.qty(tape) = 0, 'ปรับยอดลงเป็น 0 ไม่ได้';

  -- (f) items.status ไม่ถูกแก้
  ASSERT (SELECT status::text FROM items WHERE id = tape) = 'available', '(f) status ของวัสดุสิ้นเปลืองถูกแก้';
  ASSERT (SELECT status::text FROM items WHERE id = stand) = 'in_use', '(f) status ของอุปกรณ์ปกติถูกแก้';
END $$;

-- (g) anon / authenticated เรียกไม่ได้ · service_role เรียกได้
DO $$
DECLARE
  fn CONSTANT TEXT := 'public.adjust_item_stock(uuid, integer, text, text, uuid, uuid, uuid)';
BEGIN
  ASSERT NOT has_function_privilege('anon', fn, 'EXECUTE'), '(g) anon มีสิทธิ์ EXECUTE';
  ASSERT NOT has_function_privilege('authenticated', fn, 'EXECUTE'), '(g) authenticated มีสิทธิ์ EXECUTE';
  ASSERT has_function_privilege('service_role', fn, 'EXECUTE'), '(g) service_role ไม่มีสิทธิ์ EXECUTE';
END $$;
SQL
echo "AC2: ผ่าน"

echo "consumables-sql: ผ่านทั้งหมด"
