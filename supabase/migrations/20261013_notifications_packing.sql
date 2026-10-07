-- ============================================================================
-- แจ้งเตือนใบจัดของ (v1.49.0) → เปิดทาง reference_type = 'packing_list'
--
-- packing_ready (ใบจัดของพร้อมรับ → หัวหน้างาน + คนในอีเวนต์) อ้าง packing_lists.id → กระดิ่งพาไป /packing/<id>
-- packing_requested อ้าง crm_lead (มีในรายการอยู่แล้ว)
--
-- รูปแบบเดียวกับ 20260828_notifications_allow_salary_slip.sql: ดรอป CHECK ของ type / reference_type แบบ dynamic
-- (ชื่อไม่แน่นอน) แล้วสร้าง CHECK ของ reference_type ใหม่ = รายการเดิมทั้งหมด + 'packing_list' ต่อท้าย
-- idempotent: รันซ้ำได้ (ดรอปของเดิมก่อนทุกครั้ง)
-- ============================================================================
DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace ns ON ns.oid = rel.relnamespace
    WHERE rel.relname = 'notifications'
      AND ns.nspname = 'public'
      AND con.contype = 'c'
      AND (pg_get_constraintdef(con.oid) ILIKE '%type%' OR pg_get_constraintdef(con.oid) ILIKE '%reference_type%')
  LOOP
    EXECUTE format('ALTER TABLE public.notifications DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE notifications
  ADD CONSTRAINT notifications_reference_type_check CHECK (
    reference_type IN (
      'job', 'ticket', 'expense_claim', 'kpi_evaluation', 'crm_lead', 'document', 'salary_slip', 'packing_list'
    )
  );

COMMENT ON CONSTRAINT notifications_reference_type_check ON notifications IS
  'ชนิดของสิ่งที่แจ้งเตือนอ้างถึง — เพิ่ม packing_list (ใบจัดของ) ใน 20261013';
