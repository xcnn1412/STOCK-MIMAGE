-- ============================================================================
-- หน้าที่เตรียมงาน (Prep duty) — ใครรับหน้าที่ไหนของงานหนึ่งงาน
--
-- ดู CONTEXT.md § "หน้าที่เตรียมงาน (Prep duty)": งานหนึ่งงานมี 3 หน้าที่
-- จัดคน (staffing) / จัดรถ (vehicle) / จัดกระเป๋า (kits) แต่ละหน้าที่รับ-คืน
-- แยกกันอิสระ ไม่บังคับลำดับ — คนละสิ่งกับการรับใบงานหน้างาน (หัวหน้างาน)
-- ที่เก็บอยู่ใน jobs.claimed_by และคนละสิ่งกับหน้าที่หน้างานของระบบเงินเดือน
--
-- หนึ่งแถว = หนึ่งหน้าที่ที่มีคนรับแล้ว · ไม่มีแถว = ยังรอรับ (คืน = ลบแถว)
-- UNIQUE (lead_id, duty) เป็นตัวกันสองคนกดรับพร้อมกัน — INSERT ที่ช้ากว่าจะได้
-- unique violation (23505) แล้ว action แปลงเป็นข้อความไทย "หน้าที่นี้มีคนรับไปแล้ว"
--
-- idempotent: CREATE TABLE/INDEX IF NOT EXISTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS lead_duty_claims (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id    UUID NOT NULL REFERENCES crm_leads(id) ON DELETE CASCADE,
  duty       TEXT NOT NULL CHECK (duty IN ('staffing', 'vehicle', 'kits')),
  claimed_by UUID NOT NULL REFERENCES profiles(id),
  claimed_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (lead_id, duty)
);

COMMENT ON TABLE  lead_duty_claims            IS 'หน้าที่เตรียมงาน (Prep duty) ที่มีคนรับแล้ว — ไม่มีแถว = ยังรอรับ';
COMMENT ON COLUMN lead_duty_claims.duty       IS 'staffing = จัดคน, vehicle = จัดรถ, kits = จัดกระเป๋า';
COMMENT ON COLUMN lead_duty_claims.claimed_by IS 'ผู้รับหน้าที่นี้ — คืนได้เฉพาะเจ้าตัวหรือแอดมิน/ฝ่ายประสานงาน';

-- ตารางภาพรวมอ่านทีเดียวทุกหน้าที่ของงานที่ตอบรับแล้ว
CREATE INDEX IF NOT EXISTS lead_duty_claims_lead_id_idx ON lead_duty_claims (lead_id);
