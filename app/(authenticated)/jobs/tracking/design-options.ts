// 9 ขั้นของสถานะออกแบบ (crm_leads.design_status) — ใช้ร่วมกันระหว่างตารางภาพรวม
// และแท็บใบงานกราฟิกของพูลงาน เพื่อให้ตัวเลือกและสีป้ายตรงกันทั้งสองที่
export const DESIGN_OPTIONS = [
    { value: 'not_started', label: 'ยังไม่เริ่ม', className: '' },
    { value: 'waiting_info', label: 'ลูกค้ายังไม่ส่งข้อมูล', className: 'bg-rose-100 text-rose-900 dark:bg-rose-900/40 dark:text-rose-100' },
    { value: 'not_designed', label: 'ยังไม่ออกแบบ', className: 'bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100' },
    { value: 'in_progress', label: 'กำลังออกแบบ', className: 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100' },
    { value: 'customer_design', label: 'ลูกค้าออกแบบเอง', className: 'bg-violet-100 text-violet-900 dark:bg-violet-900/40 dark:text-violet-100' },
    { value: 'revising', label: 'กำลังแก้ไขงาน', className: 'bg-orange-100 text-orange-900 dark:bg-orange-900/40 dark:text-orange-100' },
    { value: 'sent', label: 'ส่งลูกค้าตรวจ', className: 'bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-100' },
    { value: 'sent_email_cf', label: 'ส่งEmail+CFลูกค้า', className: 'bg-teal-100 text-teal-900 dark:bg-teal-900/40 dark:text-teal-100' },
    { value: 'completed', label: 'ส่งภาพ+เสร็จสมบูรณ์', className: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100' },
]
