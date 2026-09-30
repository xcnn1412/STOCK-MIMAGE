-- ============================================================================
-- คิวใบเบิก (ขั้น 4 ของ docs/specs/finance-refactor-plan.md) — ซ่อนใบเบิกแทนการลบ + เวลาที่สถานะเปลี่ยนล่าสุด
--
--   deleted_at         เวลาที่แอดมินซ่อนใบเบิก (ว่าง = ไม่ได้ซ่อน) — ใบที่ซ่อนไม่อยู่ในรายการและคิว กู้คืนได้
--                      ไฟล์แนบและประวัติยังอยู่ครบ (ต่างจากการลบเดิมที่ลบทั้งแถว ไฟล์ และประวัติ)
--   deleted_by         แอดมินที่ซ่อน
--   status_changed_at  เวลาที่สถานะเปลี่ยนครั้งล่าสุด — คิวใช้คิดอายุงาน ("ค้างนาน")
--                      trigger ตั้งค่าให้เองทุกครั้งที่สถานะเปลี่ยน (แก้ข้อมูลอื่นของใบไม่เปลี่ยนค่านี้)
--                      ใบที่มีอยู่แล้วเติมจากประวัติ (แถวล่าสุดที่เปลี่ยนมาเป็นสถานะปัจจุบัน) หรือช่องเวลาของสถานะนั้น
--
-- เพิ่มอย่างเดียว ไม่ลบข้อมูล ไม่แตะ RLS · รันซ้ำได้: รอบที่สองไม่เปลี่ยนข้อมูล
-- ลำดับ deploy: รันไฟล์นี้ก่อน แล้วค่อย deploy v1.26.0
--   (ก่อนรัน: รายการใบเบิกของพนักงานยังใช้ได้ · คิวของแอดมินแสดงข้อความให้รันไฟล์นี้ · ซ่อนใบเบิกยังไม่ได้)
-- ============================================================================

ALTER TABLE expense_claims
  ADD COLUMN IF NOT EXISTS deleted_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by        UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status_changed_at TIMESTAMPTZ;

COMMENT ON COLUMN expense_claims.deleted_at IS 'เวลาที่แอดมินซ่อนใบเบิก (ว่าง = ไม่ได้ซ่อน) — ใบที่ซ่อนไม่อยู่ในรายการและคิว กู้คืนได้';
COMMENT ON COLUMN expense_claims.deleted_by IS 'แอดมินที่ซ่อนใบเบิก';
COMMENT ON COLUMN expense_claims.status_changed_at IS 'เวลาที่สถานะเปลี่ยนครั้งล่าสุด (trigger expense_claims_status_changed_at ตั้งให้) — ใช้คิดอายุงานในคิวใบเบิก';

-- ── เติมค่าให้ใบที่มีอยู่: ประวัติล่าสุดที่เปลี่ยนมาเป็นสถานะปัจจุบัน → ช่องเวลาของสถานะนั้น → เวลาสร้างใบ ──
UPDATE expense_claims c
   SET status_changed_at = COALESCE(
         (SELECT max(l.created_at)
            FROM expense_claim_logs l
           WHERE l.claim_id = c.id
             AND l.changes->'status'->>'to' = c.status),
         CASE c.status
           WHEN 'paid'                THEN c.paid_at
           WHEN 'refund_confirmed'    THEN COALESCE(c.refund_confirmed_at, c.paid_at)
           WHEN 'pending'             THEN c.submitted_at
           WHEN 'cancelled'           THEN c.cancelled_at
           WHEN 'approved'            THEN c.approved_at
           WHEN 'waiting_tax_invoice' THEN c.approved_at
           WHEN 'pending_month_end'   THEN c.approved_at
           WHEN 'awaiting_payment'    THEN c.approved_at
           WHEN 'rejected'            THEN c.approved_at
         END,
         c.created_at)
 WHERE c.status_changed_at IS NULL;

-- ── ตั้ง status_changed_at เองเมื่อสร้างใบ และทุกครั้งที่สถานะเปลี่ยน ─────────────────────────
CREATE OR REPLACE FUNCTION public.expense_claims_touch_status_changed_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.status_changed_at := COALESCE(NEW.status_changed_at, now());
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.status_changed_at := now();
  END IF;
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.expense_claims_touch_status_changed_at() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expense_claims_touch_status_changed_at() TO service_role;

DROP TRIGGER IF EXISTS expense_claims_status_changed_at ON expense_claims;
CREATE TRIGGER expense_claims_status_changed_at
  BEFORE INSERT OR UPDATE OF status ON expense_claims
  FOR EACH ROW EXECUTE FUNCTION public.expense_claims_touch_status_changed_at();

-- ── คิวอ่านเฉพาะใบที่ไม่ได้ซ่อนตามสถานะ ──────────────────────────────────────────
CREATE INDEX IF NOT EXISTS expense_claims_open_status_idx
  ON expense_claims (status)
  WHERE deleted_at IS NULL;
