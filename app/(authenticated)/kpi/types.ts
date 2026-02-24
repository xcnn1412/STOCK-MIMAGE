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

