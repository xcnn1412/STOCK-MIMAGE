// Job Costing Module — Types & Constants

/** หมวดต้นทุน */
export const COST_CATEGORIES = [
  { value: 'staff', label: 'Staff', labelTh: 'ค่าสตาฟ', icon: 'Users', color: '#ef4444' },
  { value: 'travel', label: 'Travel', labelTh: 'ค่าเดินทาง', icon: 'Car', color: '#f97316' },
  { value: 'equipment', label: 'Equipment', labelTh: 'อุปกรณ์ออกอีเวนต์', icon: 'Package', color: '#eab308' },
  { value: 'food', label: 'Food & Beverage', labelTh: 'อาหารและเครื่องดื่ม', icon: 'UtensilsCrossed', color: '#22c55e' },
  { value: 'venue', label: 'Venue', labelTh: 'ค่าสถานที่', icon: 'Building2', color: '#3b82f6' },
  { value: 'marketing', label: 'Marketing', labelTh: 'การตลาด / โฆษณา', icon: 'Megaphone', color: '#8b5cf6' },
  { value: 'other', label: 'Other', labelTh: 'อื่นๆ', icon: 'MoreHorizontal', color: '#6b7280' },
] as const

export type CostCategory = typeof COST_CATEGORIES[number]['value']

/** สถานะ Job Event */
export const JOB_STATUSES = [
  { value: 'draft', label: 'Draft', labelTh: 'แบบร่าง' },
  { value: 'completed', label: 'Completed', labelTh: 'เสร็จสิ้น' },
] as const

export type JobStatus = typeof JOB_STATUSES[number]['value']

/** หา label ภาษาไทย ตามหมวด */
export function getCategoryLabel(category: string, locale: 'th' | 'en' = 'th') {
  const cat = COST_CATEGORIES.find(c => c.value === category)
  return locale === 'th' ? (cat?.labelTh || category) : (cat?.label || category)
}

/** หา color ตามหมวด */
export function getCategoryColor(category: string) {
  return COST_CATEGORIES.find(c => c.value === category)?.color || '#6b7280'
}
