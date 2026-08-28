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
-- 3b. salary_slips.checkin_ids — เช็คอินทุกใบที่สลิปนี้ "กินไปแล้ว"
--     บรรทัดสลิปครอบคลุมไม่ครบ: เช็คอินรันเนอร์ (manual_daily) และเช็คอินที่ยัง
--     ไม่ได้ระบุหน้าที่ ไม่สร้างบรรทัด site/oop จึงไม่มี checkin_id ที่ไหนเลย
--     → ถ้าอาศัย lines อย่างเดียวจะไม่ถูกประทับ แล้วงวดถัดไปที่ทับกันจ่ายซ้ำ
--     คอลัมน์นี้เก็บ id ของเช็คอิน "หน้างาน" ที่ถูกเลือกเข้าสลิปตอนคำนวณทุกใบ
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE salary_slips ADD COLUMN IF NOT EXISTS checkin_ids UUID[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN salary_slips.checkin_ids IS
  'เช็คอินหน้างานทุกใบที่สลิปนี้กิน (รวมรันเนอร์/ไม่มีหน้าที่ ที่ไม่มีบรรทัด) — finalize_salary_slip ประทับ paid_slip_id ให้ทั้งชุด';

-- ────────────────────────────────────────────────────────────────────────────
-- 3c. Guard ของสลิป — เพิ่ม checkin_ids เข้าคอลัมน์ที่ห้ามเปลี่ยนหลังปิดงวด
--     (ฟังก์ชันเดิมอยู่ใน 20260828_create_salary_module.sql §7 ซึ่งรันบน prod ไปแล้ว
--      จึงต้อง CREATE OR REPLACE ทั้งตัวที่นี่ — เนื้อในเหมือนเดิมทุกบรรทัด
--      ยกเว้นบรรทัด checkin_ids ที่เพิ่มเข้ามา; costs_synced_at ยังเปลี่ยนได้ตั้งใจ)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.salary_slips_guard_finalized()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF COALESCE(current_setting('app.allow_salary_purge', true), '') = 'on' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.status IS DISTINCT FROM 'draft' THEN
      RAISE EXCEPTION 'ห้ามลบสลิปที่ปิดงวดแล้ว';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.status IN ('finalized', 'paid') THEN
    -- ห้ามถอยสถานะ; finalized ไปได้แค่ paid, paid ไปไหนไม่ได้
    IF NEW.status IS DISTINCT FROM OLD.status
       AND NOT (OLD.status = 'finalized' AND NEW.status = 'paid') THEN
      RAISE EXCEPTION 'ห้ามแก้ไขสลิปที่ปิดงวดแล้ว';
    END IF;

    -- อนุญาตเฉพาะ: status, paid_at, paid_by, costs_synced_at, updated_at
    IF NEW.id              IS DISTINCT FROM OLD.id
    OR NEW.run_id          IS DISTINCT FROM OLD.run_id
    OR NEW.user_id         IS DISTINCT FROM OLD.user_id
    OR NEW.employment_type IS DISTINCT FROM OLD.employment_type
    OR NEW.base_salary     IS DISTINCT FROM OLD.base_salary
    OR NEW.lines           IS DISTINCT FROM OLD.lines
    OR NEW.checkin_ids     IS DISTINCT FROM OLD.checkin_ids
    OR NEW.adjustments     IS DISTINCT FROM OLD.adjustments
    OR NEW.warnings        IS DISTINCT FROM OLD.warnings
    OR NEW.total           IS DISTINCT FROM OLD.total
    OR NEW.computed_at     IS DISTINCT FROM OLD.computed_at
    OR NEW.finalized_at    IS DISTINCT FROM OLD.finalized_at
    OR NEW.finalized_by    IS DISTINCT FROM OLD.finalized_by
    OR NEW.created_at      IS DISTINCT FROM OLD.created_at
    THEN
      RAISE EXCEPTION 'ห้ามแก้ไขสลิปที่ปิดงวดแล้ว';
    END IF;
  END IF;

  RETURN NEW;
END $$;

-- ────────────────────────────────────────────────────────────────────────────
-- 3d. Guard ของเช็คอิน — เช็คอินที่ถูกจ่ายในสลิปแล้ว ห้ามแก้ตัวเลข/ห้ามลบ
--     ไม่งั้นแก้ duties/เวลา/อีเวนต์ย้อนหลังได้ ทั้งที่เงินจ่ายออกไปตามตัวเลขเดิม
--     เปลี่ยนได้อยู่: paid_slip_id เอง (FK ON DELETE SET NULL + RPC ประทับ),
--     note, province, district, พิกัด, รูป, updated_at ฯลฯ
--     ยกเว้นเมื่อ GUC app.allow_salary_purge = 'on' (convention เดียวกับ guard สลิป)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.staff_checkins_guard_paid()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.paid_slip_id IS NULL
     OR COALESCE(current_setting('app.allow_salary_purge', true), '') = 'on' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'เช็คอินนี้ถูกจ่ายในสลิปแล้ว ลบไม่ได้';
  END IF;

  IF NEW.user_id         IS DISTINCT FROM OLD.user_id
  OR NEW.check_type      IS DISTINCT FROM OLD.check_type
  OR NEW.checked_in_at   IS DISTINCT FROM OLD.checked_in_at
  OR NEW.checked_out_at  IS DISTINCT FROM OLD.checked_out_at
  OR NEW.duties          IS DISTINCT FROM OLD.duties
  OR NEW.out_of_province IS DISTINCT FROM OLD.out_of_province
  OR NEW.event_id        IS DISTINCT FROM OLD.event_id
  THEN
    RAISE EXCEPTION 'เช็คอินนี้ถูกจ่ายในสลิปแล้ว แก้ไขไม่ได้';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS staff_checkins_guard_paid ON staff_checkins;
CREATE TRIGGER staff_checkins_guard_paid
  BEFORE UPDATE OR DELETE ON staff_checkins
  FOR EACH ROW EXECUTE FUNCTION public.staff_checkins_guard_paid();

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
  v_status   TEXT;
  v_lines    JSONB;
  v_ids      UUID[];
  v_line_ids UUID[];
  v_date     TEXT;
BEGIN
  SELECT status, lines, COALESCE(checkin_ids, '{}'::UUID[])
    INTO v_status, v_lines, v_ids
  FROM salary_slips WHERE id = p_slip_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ไม่พบสลิป';
  END IF;
  IF v_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'สลิปนี้ปิดงวดแล้ว';
  END IF;

  -- เช็คอินที่สลิปนี้จ่ายให้ = checkin_ids ที่บันทึกไว้ตอนคำนวณ ∪ checkin_id ในบรรทัด
  -- (union เพราะสลิปร่างที่คำนวณไว้ก่อนมีคอลัมน์ checkin_ids ยังมีแต่บรรทัด)
  SELECT COALESCE(array_agg(DISTINCT x.cid), '{}'::UUID[]) INTO v_line_ids
  FROM (
    SELECT (e ->> 'checkin_id')::UUID AS cid
    FROM jsonb_array_elements(COALESCE(v_lines, '[]'::JSONB)) e
    WHERE e ->> 'checkin_id' IS NOT NULL
  ) x;

  v_ids := ARRAY(SELECT DISTINCT u FROM unnest(v_ids || v_line_ids) u WHERE u IS NOT NULL);

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
  'ปิดงวดสลิปร่าง + ประทับ paid_slip_id ให้เช็คอินใน checkin_ids รวมกับที่อยู่ในบรรทัด — ถ้าเช็คอินถูกจ่ายในสลิปอื่นแล้วจะ RAISE';

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
