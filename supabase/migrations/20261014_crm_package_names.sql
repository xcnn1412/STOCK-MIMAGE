-- ============================================================================
-- CRM: เลิกใช้รายการแพ็กเกจเดิมใน crm_settings (หมวด 'package') — เฟส 6 ของแผนอุปกรณ์
--
-- ทำไม:
--  แพ็กเกจย้ายไปตาราง packages แล้ว (migration 20261011_packages.sql, ตั้งที่ คลังอุปกรณ์ → แพ็กเกจ)
--  ทีมขายเลือกแพ็กเกจผ่านตาราง lead_packages และระบบเขียน crm_leads.package_name เป็น "ชื่อแพ็กเกจ"
--  แต่ลูกค้าเก่ายังเก็บ package_name เป็น "คีย์" ของ crm_settings (เช่น 'premium') ซึ่งต้องแปลงชื่อทุกครั้งที่แสดง
--
-- ทำอะไร:
--  1) แปลง crm_leads.package_name ที่ตรงกับคีย์ของ crm_settings หมวด package → ชื่อไทย (label_th)
--     ผู้อ่านทุกจุดแสดงค่าดิบเมื่อไม่มีแถวตั้งค่าที่ตรง ชื่อของงานเก่าจึงแสดงเหมือนเดิม
--  2) ปิดใช้ (is_active = false) แถว crm_settings หมวด package ทั้งหมด — ไม่ลบ เก็บไว้อ้างอิงย้อนหลัง
--     (ราคาเดิม crm_settings.price ไม่ใช้แล้ว ราคาอยู่ที่ packages.price)
--
-- รันซ้ำได้: แถวที่แปลงแล้วไม่ตรงคีย์อีก (หรือเท่ากับ label_th อยู่แล้ว) จึงไม่ถูกแตะซ้ำ · ปิดใช้ซ้ำไม่เปลี่ยนอะไร
-- ============================================================================

BEGIN;

UPDATE crm_leads
SET package_name = s.label_th
FROM crm_settings s
WHERE s.category = 'package'
  AND s.label_th IS NOT NULL
  AND s.label_th <> ''
  AND crm_leads.package_name = s.value
  AND crm_leads.package_name IS DISTINCT FROM s.label_th;

UPDATE crm_settings
SET is_active = false
WHERE category = 'package'
  AND is_active IS DISTINCT FROM false;

COMMENT ON COLUMN crm_leads.package_name IS
  'ชื่อแพ็กเกจที่ทีมขายเลือก (คั่นด้วย " + ") — แพ็กเกจจริงอยู่ที่ lead_packages/packages; ค่าเก่าที่เคยเป็นคีย์ crm_settings ถูกแปลงเป็นชื่อแล้ว (20261014)';

COMMIT;
