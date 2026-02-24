// KPI Module — ค่าคงที่และ types เฉพาะ KPI

/** Mode ของ KPI Template */
export const KPI_MODES = [
  { value: 'task', label: 'Task', labelTh: 'งาน' },
  { value: 'sales', label: 'Sales', labelTh: 'ยอดขาย' },
  { value: 'cost_reduction', label: 'Cost Reduction', labelTh: 'ลดต้นทุน' },
] as const

export type KpiMode = typeof KPI_MODES[number]['value']

/** รอบการประเมิน */
export const KPI_CYCLES = [
  { value: 'weekly', label: 'Weekly', labelTh: 'รายสัปดาห์ (ทุกวันศุกร์)' },
  { value: 'monthly', label: 'Monthly', labelTh: 'รายเดือน (ทุกวันที่ 25)' },
  { value: 'yearly', label: 'Yearly', labelTh: 'รายปี (สิ้นปี)' },
] as const

export type KpiCycle = typeof KPI_CYCLES[number]['value']

/** Status ของ Assignment */
export const KPI_STATUSES = [
  { value: 'active', label: 'Active', labelTh: 'กำลังใช้งาน' },
  { value: 'paused', label: 'Paused', labelTh: 'หยุดชั่วคราว' },
  { value: 'completed', label: 'Completed', labelTh: 'เสร็จสิ้น' },
] as const

/** Config fields ตาม mode */
export const MODE_CONFIG_FIELDS: Record<KpiMode, { key: string; label: string; type: 'text' | 'number' }[]> = {
  task: [
    { key: 'task_description', label: 'รายละเอียดงาน', type: 'text' },
    { key: 'expected_output', label: 'ผลลัพธ์ที่คาดหวัง', type: 'text' },
    { key: 'deadline_days', label: 'กำหนดวัน (วัน)', type: 'number' },
  ],
  sales: [
    { key: 'product_category', label: 'หมวดสินค้า', type: 'text' },
    { key: 'revenue_target', label: 'เป้ารายได้ (บาท)', type: 'number' },
    { key: 'unit_target', label: 'เป้าจำนวน (ชิ้น)', type: 'number' },
  ],
  cost_reduction: [
    { key: 'cost_category', label: 'หมวดต้นทุน', type: 'text' },
    { key: 'baseline_cost', label: 'ต้นทุนฐาน (บาท)', type: 'number' },
    { key: 'reduction_percentage_target', label: 'เป้า % ลดต้นทุน', type: 'number' },
  ],
}
