-- ============================================================================
-- โมดูล "เงินเดือน" — งวดรายสัปดาห์/กำหนดเอง + เช็คอินจ่ายได้ครั้งเดียว
-- spec: docs/specs/salary-weekly-runs.md · issue #20 (ticket #21)
-- ต่อจาก 20260828_create_salary_module.sql — ไฟล์นี้ idempotent รันซ้ำได้
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. salary_runs.kind — ชนิดงวด
--    monthly = งวดเดือนเดิม (period_key = 'YYYY-MM')
--    weekly  = จันทร์–อาทิตย์ / custom = ช่วงวันที่ตามใจ (period_key = 'start_end')
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE salary_runs ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'monthly';

ALTER TABLE salary_runs DROP CONSTRAINT IF EXISTS salary_runs_kind_check;
ALTER TABLE salary_runs ADD CONSTRAINT salary_runs_kind_check
  CHECK (kind IN ('monthly', 'weekly', 'custom'));

COMMENT ON COLUMN salary_runs.kind IS
  'ชนิดงวด — monthly (period_key = YYYY-MM) / weekly / custom (period_key = YYYY-MM-DD_YYYY-MM-DD)';

-- ────────────────────────────────────────────────────────────────────────────
-- 2. staff_checkins.paid_slip_id — เช็คอินหนึ่งครั้งถูกจ่ายได้ครั้งเดียว
--    ประทับตอนปิดงวดสลิป (finalize_salary_slip) — งวดทับซ้อนกันได้โดยไม่จ่ายซ้ำ
--    ON DELETE SET NULL: สลิปร่างถูกลบได้ (สลิปที่ปิดงวดแล้วลบไม่ได้ตาม guard trigger)
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE staff_checkins ADD COLUMN IF NOT EXISTS paid_slip_id UUID
  REFERENCES salary_slips(id) ON DELETE SET NULL;

COMMENT ON COLUMN staff_checkins.paid_slip_id IS
  'สลิปที่จ่ายเช็คอินนี้ไปแล้ว (NULL = ยังไม่ถูกจ่าย) — ประทับตอนปิดงวดโดย finalize_salary_slip()';

-- คิวรีหลักของโมดูล: "เช็คอินหน้างานที่ยังไม่จ่ายของคนนี้ในช่วงวันที่ …"
CREATE INDEX IF NOT EXISTS staff_checkins_unpaid_onsite_idx
  ON staff_checkins(user_id, checked_in_at)
  WHERE paid_slip_id IS NULL AND check_type = 'onsite';

-- ────────────────────────────────────────────────────────────────────────────
-- 3. salary_slips.costs_synced_at — เวลาที่ sync บรรทัดเข้าโมดูลต้นทุนสำเร็จ
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE salary_slips ADD COLUMN IF NOT EXISTS costs_synced_at TIMESTAMPTZ;

COMMENT ON COLUMN salary_slips.costs_synced_at IS
  'เวลาที่บรรทัดค่าสตาฟของสลิปนี้ถูกเขียนเข้า job_cost_items สำเร็จครั้งล่าสุด (NULL = ยังไม่ sync)';

-- ────────────────────────────────────────────────────────────────────────────
-- 4. finalize_salary_slip — ปิดงวดสลิป + ประทับ paid_slip_id ใน transaction เดียว
--    ล็อกสลิปและแถวเช็คอินก่อน เพื่อกันสองงวดที่ทับกันปิดพร้อมกันแล้วจ่ายซ้ำ
--    guard trigger เดิมยังทำงาน (ที่นี่เปลี่ยนแค่ draft → finalized ซึ่ง guard อนุญาต)
--    ผู้เรียก (server action) ตรวจสิทธิ์ admin + รันเนอร์กรอกครบมาก่อนแล้ว
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.finalize_salary_slip(p_slip_id UUID, p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status TEXT;
  v_lines  JSONB;
  v_ids    UUID[];
  v_date   TEXT;
BEGIN
  SELECT status, lines INTO v_status, v_lines
  FROM salary_slips WHERE id = p_slip_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ไม่พบสลิป';
  END IF;
  IF v_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'สลิปนี้ปิดงวดแล้ว';
  END IF;

  -- เช็คอินที่สลิปนี้จ่ายให้ = checkin_id ของบรรทัด (บรรทัด OT/รันเนอร์ไม่มี → ข้าม)
  SELECT COALESCE(array_agg(DISTINCT x.cid), '{}'::UUID[]) INTO v_ids
  FROM (
    SELECT (e ->> 'checkin_id')::UUID AS cid
    FROM jsonb_array_elements(COALESCE(v_lines, '[]'::JSONB)) e
    WHERE e ->> 'checkin_id' IS NOT NULL
  ) x;

  IF COALESCE(array_length(v_ids, 1), 0) > 0 THEN
    -- ล็อกเรียงตาม id — สองงวดที่ปิดพร้อมกันจะเข้าคิวกัน ไม่ deadlock
    PERFORM 1 FROM staff_checkins WHERE id = ANY(v_ids) ORDER BY id FOR UPDATE;

    SELECT to_char(checked_in_at AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM-DD') INTO v_date
    FROM staff_checkins
    WHERE id = ANY(v_ids)
      AND paid_slip_id IS NOT NULL
      AND paid_slip_id <> p_slip_id
    ORDER BY checked_in_at
    LIMIT 1;

    IF FOUND THEN
      RAISE EXCEPTION 'เช็คอินวันที่ % ถูกจ่ายในสลิปอื่นแล้ว — กดคำนวณใหม่', v_date;
    END IF;

    UPDATE staff_checkins SET paid_slip_id = p_slip_id WHERE id = ANY(v_ids);
  END IF;

  UPDATE salary_slips
  SET status = 'finalized', finalized_at = now(), finalized_by = p_user_id, updated_at = now()
  WHERE id = p_slip_id;
END $$;

REVOKE ALL ON FUNCTION public.finalize_salary_slip(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_salary_slip(UUID, UUID) TO service_role;

COMMENT ON FUNCTION public.finalize_salary_slip(UUID, UUID) IS
  'ปิดงวดสลิปร่าง + ประทับ paid_slip_id ให้เช็คอินในบรรทัด — ถ้าเช็คอินถูกจ่ายในสลิปอื่นแล้วจะ RAISE';

-- ────────────────────────────────────────────────────────────────────────────
-- 5. Backfill — สลิปที่ปิดงวด/จ่ายไปแล้วก่อน deploy ต้องประทับย้อนหลัง
--    ไม่งั้นงวดแรกหลัง deploy จะดึงเช็คอินที่จ่ายไปแล้วมาจ่ายซ้ำ
-- ────────────────────────────────────────────────────────────────────────────
UPDATE staff_checkins c
SET paid_slip_id = s.id
FROM salary_slips s
CROSS JOIN LATERAL (
  SELECT (e ->> 'checkin_id')::UUID AS cid
  FROM jsonb_array_elements(COALESCE(s.lines, '[]'::JSONB)) e
  WHERE e ->> 'checkin_id' IS NOT NULL
) x
WHERE s.status IN ('finalized', 'paid')
  AND c.id = x.cid
  AND c.paid_slip_id IS NULL;

-- หมายเหตุ: purge_test_salary_run ไม่ต้องแก้ — ลบงวดทดสอบแล้วสลิปถูกลบตาม CASCADE
-- และ paid_slip_id ของเช็คอินถูกล้างเองด้วย ON DELETE SET NULL ของ FK ข้อ 2
