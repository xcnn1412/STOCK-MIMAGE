-- ============================================================================
-- เลขที่ใบเบิกไม่ซ้ำ
--
-- ปัญหาที่พบ 2026-09-30: เลขที่ใบเบิกซ้ำ 134 เลข เกี่ยวกับ 281 ใบ (ซ้ำมากสุด 4 ใบต่อเลข)
-- สาเหตุ: โค้ดเดิมนับจำนวนใบของเดือนแล้วบวกหนึ่ง จึงซ้ำเมื่อสร้างพร้อมกันหรือหลังมีการลบ
-- และไม่มีข้อบังคับในฐานข้อมูล
--
-- ไฟล์นี้ทำ 4 อย่าง (เจ้าของตัดสินใจ 2026-09-29):
--   1. ใบแรกของแต่ละเลข (สร้างก่อน) คงเลขเดิม ใบที่ซ้ำได้ตัวต่อท้าย -2, -3, …
--      เลขเดิมเก็บไว้ในช่อง original_claim_number และมีประวัติในหน้าใบเบิก
--   2. รายการต้นทุนที่อ้างใบเบิกนั้น (job_cost_items.notes = "<เลขที่>::<id>") ได้เลขใหม่ตาม
--   3. ตั้งข้อบังคับ: เลขที่ใบเบิกซ้ำไม่ได้
--   4. ฟังก์ชัน next_claim_number() ออกเลขถัดไปของเดือน (ตามเวลาไทย) แบบไม่ซ้ำแม้เรียกพร้อมกัน
--
-- ไฟล์ในที่เก็บไฟล์ไม่ถูกย้าย (โฟลเดอร์ยังเป็นเลขเดิม ลิงก์เดิมใช้ได้)
-- รันซ้ำได้: รอบที่สองไม่มีเลขซ้ำเหลือ จึงไม่เปลี่ยนอะไร
-- ก่อนรัน: สำรองตาราง expense_claims และ job_cost_items
-- รายการใบที่จะเปลี่ยนเลข ดูได้ก่อนด้วยคำสั่งท้ายไฟล์ (อยู่ในคอมเมนต์)
-- ============================================================================

ALTER TABLE expense_claims
  ADD COLUMN IF NOT EXISTS original_claim_number TEXT;

COMMENT ON COLUMN expense_claims.original_claim_number IS
  'เลขที่เดิมของใบที่ถูกเปลี่ยนเลขเพราะซ้ำ (ว่าง = ไม่เคยเปลี่ยน) — เอกสารที่พิมพ์ไปแล้วใช้เลขนี้';

-- ── 1–2) เติมตัวต่อท้ายให้ใบที่ซ้ำ ─────────────────────────────────────────────
DO $$
DECLARE
  r       record;
  v_new   text;
  v_n     integer;
  v_count integer := 0;
BEGIN
  FOR r IN
    SELECT id, claim_number, rn
    FROM (
      SELECT id, claim_number,
             row_number() OVER (PARTITION BY claim_number ORDER BY created_at, id) AS rn
      FROM expense_claims
      WHERE claim_number IS NOT NULL
    ) ranked
    WHERE rn > 1
    ORDER BY claim_number, rn
  LOOP
    v_n := r.rn;
    LOOP
      v_new := r.claim_number || '-' || v_n;
      EXIT WHEN NOT EXISTS (SELECT 1 FROM expense_claims WHERE claim_number = v_new);
      v_n := v_n + 1;
    END LOOP;

    UPDATE expense_claims
       SET claim_number = v_new,
           original_claim_number = COALESCE(original_claim_number, r.claim_number)
     WHERE id = r.id;

    -- จับคู่ด้วย id ของใบเบิกท้ายข้อความ ไม่ใช่ด้วยเลขที่ (เลขเดิมซ้ำกับใบอื่น)
    UPDATE job_cost_items
       SET notes = v_new || '::' || r.id::text
     WHERE notes LIKE '%::' || r.id::text;

    INSERT INTO expense_claim_logs (claim_id, action, changed_by, changes, note)
    VALUES (
      r.id, 'renumber_claim', NULL,
      jsonb_build_object('claim_number', jsonb_build_object('from', r.claim_number, 'to', v_new)),
      'เปลี่ยนเลขที่เพราะซ้ำกับใบอื่น'
    );

    v_count := v_count + 1;
  END LOOP;

  RAISE NOTICE 'เปลี่ยนเลขที่ใบเบิก % ใบ', v_count;
END $$;

-- ── 3) ข้อบังคับไม่ซ้ำ ────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS expense_claims_claim_number_key
  ON expense_claims (claim_number);

-- ── 4) ตัวออกเลข ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS expense_claim_counters (
  period  TEXT    PRIMARY KEY CHECK (period ~ '^[0-9]{6}$'),
  last_no INTEGER NOT NULL    CHECK (last_no >= 0)
);

ALTER TABLE expense_claim_counters ENABLE ROW LEVEL SECURITY;  -- ไม่มี policy: เข้าได้เฉพาะ service_role

CREATE OR REPLACE FUNCTION public.next_claim_number()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period TEXT := to_char(now() AT TIME ZONE 'Asia/Bangkok', 'YYYYMM');
  v_max    INTEGER;
  v_no     INTEGER;
BEGIN
  -- เลขสูงสุดที่มีอยู่จริงของเดือนนี้ (เลขลำดับคือกลุ่มตัวเลขหลังเดือน ไม่รวมตัวต่อท้าย -2, -3)
  SELECT COALESCE(MAX((substring(claim_number FROM '^EXP-[0-9]{6}-([0-9]+)'))::INTEGER), 0)
    INTO v_max
    FROM expense_claims
   WHERE claim_number LIKE 'EXP-' || v_period || '-%';

  -- แถวตัวนับถูกล็อกระหว่างคำสั่งนี้ คำขอที่มาพร้อมกันจึงได้เลขคนละตัว
  INSERT INTO expense_claim_counters AS c (period, last_no)
  VALUES (v_period, v_max + 1)
  ON CONFLICT (period) DO UPDATE
     SET last_no = GREATEST(c.last_no, v_max) + 1
  RETURNING c.last_no INTO v_no;

  -- อย่างน้อย 3 หลัก; lpad ตัดข้อความที่ยาวกว่าความยาวที่กำหนด จึงต้องขยายความยาวตามเลขจริง (ใบที่ 1000 ต้องไม่กลายเป็น 100)
  RETURN 'EXP-' || v_period || '-' || lpad(v_no::TEXT, GREATEST(3, length(v_no::TEXT)), '0');
END $$;

REVOKE ALL ON FUNCTION public.next_claim_number() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.next_claim_number() TO service_role;

-- ── ดูก่อนรัน: ใบที่จะเปลี่ยนเลข ─────────────────────────────────────────────
-- SELECT claim_number AS เลขเดิม, claim_number || '-' || rn AS เลขใหม่, created_at, title, amount, status
-- FROM (
--   SELECT *, row_number() OVER (PARTITION BY claim_number ORDER BY created_at, id) AS rn
--   FROM expense_claims
-- ) ranked
-- WHERE rn > 1
-- ORDER BY claim_number, rn;
