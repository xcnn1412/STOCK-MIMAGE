-- เพิ่มประเภทการจ้าง 'intern' (นักศึกษาฝึกงาน) — คิดเงินแบบเดียวกับ fulltime
ALTER TABLE salary_profiles DROP CONSTRAINT IF EXISTS salary_profiles_employment_type_check;
ALTER TABLE salary_profiles ADD CONSTRAINT salary_profiles_employment_type_check
  CHECK (employment_type IN ('fulltime', 'freelance', 'intern'));
