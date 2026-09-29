-- ============================================================================
-- จับชุดเอกสารใบเบิก — เครื่องหมาย "เข้าแฟ้มแล้ว"
-- สเปก: docs/specs/claim-document-bundle.md
--
-- ใบเบิกที่พิมพ์ชุดเอกสารและเก็บเข้าแฟ้มของ office แล้ว ถูกทำเครื่องหมายด้วยสามช่องนี้
--   filed_at          เวลาที่ทำเครื่องหมาย (ว่าง = ยังไม่เข้าแฟ้ม)
--   filed_by          คนที่ทำเครื่องหมาย
--   filed_file_count  จำนวนไฟล์แนบของใบเบิก ณ ตอนนั้น — ถ้าภายหลังจำนวนไม่ตรง
--                     หน้าจอจะเตือนว่า "ไฟล์แนบเปลี่ยนหลังเข้าแฟ้ม" ให้พิมพ์ใหม่
--
-- รันซ้ำได้ ไม่แตะข้อมูลเดิม: ใบเบิกที่มีอยู่ทั้งหมดถือว่ายังไม่เข้าแฟ้ม
-- ============================================================================

ALTER TABLE expense_claims
  ADD COLUMN IF NOT EXISTS filed_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS filed_by         UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS filed_file_count INTEGER;

-- เวลากับจำนวนไฟล์ต้องมีพร้อมกันหรือว่างพร้อมกัน (filed_by ไม่รวม: ว่างได้เมื่อผู้ใช้คนนั้นถูกลบ)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'expense_claims_filed_pair_check' AND conrelid = 'expense_claims'::regclass
  ) THEN
    ALTER TABLE expense_claims
      ADD CONSTRAINT expense_claims_filed_pair_check
      CHECK ((filed_at IS NULL) = (filed_file_count IS NULL) AND (filed_file_count IS NULL OR filed_file_count >= 0));
  END IF;
END $$;

COMMENT ON COLUMN expense_claims.filed_at IS 'เวลาที่ทำเครื่องหมายว่าพิมพ์ชุดเอกสารเข้าแฟ้มแล้ว (ว่าง = ยังไม่เข้าแฟ้ม)';
COMMENT ON COLUMN expense_claims.filed_by IS 'ผู้ทำเครื่องหมายเข้าแฟ้ม';
COMMENT ON COLUMN expense_claims.filed_file_count IS 'จำนวนไฟล์แนบ ณ ตอนทำเครื่องหมาย ใช้เตือนเมื่อไฟล์แนบเปลี่ยนภายหลัง';
