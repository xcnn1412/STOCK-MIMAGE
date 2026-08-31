# พูลงานอ่านจากตาราง jobs ไม่ใช่ crm_leads

เดิมหน้าติดตามงาน (/jobs/tracking) query `crm_leads` ที่ `status = 'accepted'` ตรง ๆ — การ์ด CRM โผล่บนบอร์ดเองโดยไม่มีการส่งต่อ และหนึ่งแถวปนงานทุกฝ่าย เราตัดสินใจให้พูลงานอ่านจากตาราง `jobs` (ใบงานรายฝ่าย: graphic/onsite ที่ถูกสร้างอัตโนมัติเมื่อ lead เป็น accepted) แทน เพื่อให้ "CRM ส่งใบงานเข้าพูลเท่านั้น" แยกฝ่ายชัดเจน และรองรับการกดรับงาน/ข้าม/คืนงานต่อใบ — ข้อมูลลูกค้า/วันงานยัง join กลับผ่าน `jobs.crm_lead_id` และฟิลด์ที่แก้ inline ระดับงาน (design_status, tracking_checklist, required_roles) ยังเก็บที่ `crm_leads` ตามเดิม

## Considered Options

- คง query `crm_leads` แล้วเพิ่มคอลัมน์รับงานบน lead — ตกไปเพราะแยกฝ่ายไม่ได้จริง (1 lead = งาน 2 ฝ่ายที่จบคนละเวลา) และตาราง `jobs` มีอยู่แล้วจาก `createJobsFromLead`
