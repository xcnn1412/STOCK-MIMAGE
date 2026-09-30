-- ============================================================================
-- ใบเบิกเร็วขึ้น (ขั้น 3 ของ docs/specs/finance-refactor-plan.md · v1.27.0) — ดัชนี + ฟังก์ชันรวมยอดหัก ณ ที่จ่าย
--
--   ดัชนี (หน้าใบเบิกกรอง/เรียงในฐานข้อมูลแทนการโหลดทุกใบ):
--     paid_at            ส่วนชำระเงินแล้ว (เดือนที่จ่าย) · คลังเก็บ (ช่วงวันที่จ่าย)
--     pettycash_fund_id  รายการในวงเงินสดย่อย
--     filed_at           เครื่องหมายเข้าแฟ้ม (สร้างเมื่อมีคอลัมน์แล้วเท่านั้น — 20260929_claim_filed.sql อาจยังไม่รัน)
--     expense_date       รายงานตรวจสอบ (ช่วงวันที่ใช้จ่าย) · คลังเก็บ (เดือน/ช่วงวันที่ใช้จ่าย)
--     (submitted_by, created_at DESC, id)  รายการของพนักงาน / คลังเก็บของพนักงาน เรียงใหม่ → เก่า
--     (submitted_by) เฉพาะใบที่มีหัก ณ ที่จ่าย   หน้าหัก ณ ที่จ่าย
--   เลขที่ใบเบิกไม่ซ้ำมีดัชนีอยู่แล้ว (expense_claims_claim_number_key ใน 20260930_claim_numbers.sql) — ไฟล์นี้ไม่สร้างซ้ำ
--   (ถ้ายังไม่รันไฟล์นั้น เลขที่อาจยังซ้ำอยู่ สร้างดัชนีไม่ซ้ำตรงนี้จะล้ม)
--
--   ฟังก์ชัน (เรียกได้เฉพาะ service_role — server ของระบบ · anon / authenticated เรียกไม่ได้):
--     finance_claim_money(ยอด, VAT, อัตราหัก)  ยอดก่อน VAT / VAT / รวม VAT / หัก ณ ที่จ่าย / ยอดจ่ายจริง ของใบหนึ่งใบ
--                                               สูตรและลำดับการคิดเดียวกับ calcTax ใน lib/finance/money.ts (float8 — ได้ค่าเดิมทุกบิต)
--     finance_wht_cells()                        ยอดรวมของใบที่มีหัก ณ ที่จ่าย ต่อ (ผู้เบิก, สถานะ, เดือนไทยของวันที่ใช้จ่าย)
--                                               + บัญชีธนาคารของใบใหม่สุดที่กรอกไว้ — หน้า /finance/download อ่านแทนแถวใบเบิกทั้งหมด
--
-- เพิ่มอย่างเดียว ไม่แตะข้อมูล ไม่แตะ RLS ไม่มี policy · รันซ้ำได้: รอบที่สองไม่เปลี่ยนอะไร
-- ลำดับบน production:
--   1. deploy v1.27.0 ก่อน (โค้ดใช้ได้โดยไม่มีไฟล์นี้ — หน้าหัก ณ ที่จ่ายรวมยอดในระบบแทน ช้ากว่า และเตือนใน log ครั้งเดียว)
--   2. รัน 20260930_claim_hide_status_time.sql (ถ้ายังไม่ได้รัน) — ไฟล์นี้ต้องมีคอลัมน์ deleted_at ของไฟล์นั้น
--   3. รันไฟล์นี้ (ไม่ต้อง restart — ทุกคำขอลองฟังก์ชันก่อน)
-- ตรวจด้วย: scripts/finance-speed.check.sql บนฐานข้อมูลทดสอบเปล่า (postgres 17)
-- ============================================================================

-- ── ต้องรัน 20260930_claim_hide_status_time.sql ก่อน (finance_wht_cells ไม่นับใบที่ซ่อน) ─────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'expense_claims' AND column_name = 'deleted_at'
  ) THEN
    RAISE EXCEPTION 'รัน 20260930_claim_hide_status_time.sql ก่อน — ยังไม่มีคอลัมน์ expense_claims.deleted_at (ไฟล์นี้ยังไม่ได้เปลี่ยนอะไร)';
  END IF;
END $$;

-- ── ดัชนี ──────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS expense_claims_paid_at_idx
  ON expense_claims (paid_at DESC)
  WHERE paid_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS expense_claims_pettycash_fund_idx
  ON expense_claims (pettycash_fund_id)
  WHERE pettycash_fund_id IS NOT NULL;

-- filed_at มาจาก 20260929_claim_filed.sql ที่อาจยังไม่รัน — สร้างเฉพาะเมื่อมีคอลัมน์ (รันไฟล์นี้ซ้ำหลังรันไฟล์นั้นได้)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'expense_claims' AND column_name = 'filed_at'
  ) THEN
    CREATE INDEX IF NOT EXISTS expense_claims_filed_at_idx
      ON expense_claims (filed_at)
      WHERE filed_at IS NOT NULL;
  ELSE
    RAISE NOTICE 'ยังไม่มีคอลัมน์ filed_at (20260929_claim_filed.sql) — ข้ามดัชนี expense_claims_filed_at_idx';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS expense_claims_expense_date_idx
  ON expense_claims (expense_date);

CREATE INDEX IF NOT EXISTS expense_claims_submitter_created_idx
  ON expense_claims (submitted_by, created_at DESC, id);

CREATE INDEX IF NOT EXISTS expense_claims_wht_submitter_idx
  ON expense_claims (submitted_by)
  WHERE withholding_tax_rate > 0;

-- ── เงินของใบหนึ่งใบ — calcTax ของ lib/finance/money.ts ใน float8 ลำดับเดียวกัน ─────────────────
-- ยอด/อัตราว่าง = 0 · VAT อื่นที่ไม่ใช่ included/excluded (รวมว่าง) = ไม่มี VAT
--   included: ก่อน VAT = ยอด / 1.07 · VAT = ยอด − ก่อน VAT · รวม = ยอด
--   excluded: VAT = ยอด × 0.07 · รวม = ยอด + VAT
--   หัก ณ ที่จ่าย = ก่อน VAT × (อัตรา / 100) · จ่ายจริง = รวม − หัก ณ ที่จ่าย
CREATE OR REPLACE FUNCTION public.finance_claim_money(p_amount numeric, p_vat_mode text, p_wht_rate numeric)
RETURNS TABLE (base_amount float8, vat_amount float8, total_with_vat float8, wht_amount float8, net_payable float8)
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT m.base, m.vat, m.total, m.base * (m.rate / 100::float8), m.total - m.base * (m.rate / 100::float8)
    FROM (
      SELECT CASE WHEN a.mode = 'included' THEN a.amt / 1.07::float8 ELSE a.amt END AS base,
             CASE WHEN a.mode = 'included' THEN a.amt - a.amt / 1.07::float8
                  WHEN a.mode = 'excluded' THEN a.amt * 0.07::float8
                  ELSE 0::float8 END AS vat,
             CASE WHEN a.mode = 'excluded' THEN a.amt + a.amt * 0.07::float8 ELSE a.amt END AS total,
             a.rate
        FROM (SELECT COALESCE(p_amount, 0)::float8 AS amt, COALESCE(p_vat_mode, '') AS mode, COALESCE(p_wht_rate, 0)::float8 AS rate) a
    ) m
$$;

REVOKE ALL ON FUNCTION public.finance_claim_money(numeric, text, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finance_claim_money(numeric, text, numeric) TO service_role;

-- ── ยอดรวมหัก ณ ที่จ่าย ต่อ (ผู้เบิก, สถานะ, เดือน) ───────────────────────────────────────────
-- เฉพาะใบที่อัตรา > 0 และไม่ได้ซ่อน · เดือน = 'YYYY-MM' ของวันที่ใช้จ่าย (ไม่มี = วันที่สร้างตามเวลาไทย)
-- บัญชีธนาคาร / เลขบัญชี / ชื่อบัญชี แต่ละช่อง = ค่าที่ไม่ว่างของใบใหม่สุด (created_at ใหม่ → เก่า ต่อด้วย id) พร้อมเวลาสร้างของใบนั้น
-- — หน้าจอรวมหลายกลุ่มแล้วเลือกค่าที่ *_at ใหม่สุด = ใบแรกที่กรอกไว้ในลำดับใหม่ → เก่า (แบบเดียวกับหน้าเดิม)
CREATE OR REPLACE FUNCTION public.finance_wht_cells()
RETURNS TABLE (
  submitted_by uuid, status text, month text, n int, gross float8, wht float8, net float8,
  bank_name text, bank_name_at timestamptz,
  bank_account_number text, bank_account_number_at timestamptz,
  account_holder_name text, account_holder_name_at timestamptz
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT c.submitted_by,
         c.status,
         COALESCE(to_char(c.expense_date, 'YYYY-MM'), to_char(c.created_at AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM')) AS month,
         count(*)::int,
         sum(COALESCE(c.amount, 0)::float8),
         sum(m.wht_amount),
         sum(m.net_payable),
         (array_agg(c.bank_name ORDER BY c.created_at DESC, c.id) FILTER (WHERE COALESCE(c.bank_name, '') <> ''))[1],
         (array_agg(c.created_at ORDER BY c.created_at DESC, c.id) FILTER (WHERE COALESCE(c.bank_name, '') <> ''))[1],
         (array_agg(c.bank_account_number ORDER BY c.created_at DESC, c.id) FILTER (WHERE COALESCE(c.bank_account_number, '') <> ''))[1],
         (array_agg(c.created_at ORDER BY c.created_at DESC, c.id) FILTER (WHERE COALESCE(c.bank_account_number, '') <> ''))[1],
         (array_agg(c.account_holder_name ORDER BY c.created_at DESC, c.id) FILTER (WHERE COALESCE(c.account_holder_name, '') <> ''))[1],
         (array_agg(c.created_at ORDER BY c.created_at DESC, c.id) FILTER (WHERE COALESCE(c.account_holder_name, '') <> ''))[1]
    FROM expense_claims c
    CROSS JOIN LATERAL public.finance_claim_money(c.amount, c.vat_mode, c.withholding_tax_rate) m
   WHERE c.withholding_tax_rate > 0
     AND c.deleted_at IS NULL
   GROUP BY c.submitted_by, c.status, 3
$$;

REVOKE ALL ON FUNCTION public.finance_wht_cells() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finance_wht_cells() TO service_role;
