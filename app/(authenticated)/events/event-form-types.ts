// ชนิดข้อมูลที่ใช้ร่วมกันระหว่างฟอร์มสร้าง/แก้ไขอีเวนต์ และหน้า server ที่ส่ง props ให้

export interface Profile {
  id: string
  full_name: string | null
  role: string
}

export interface StaffRole {
  value: string
  label_th: string
  label_en: string
  color: string | null
}

export interface StaffAssignment {
  user_id: string
  full_name: string
  role: string
}

/** แถว crm_settings ที่ฟอร์มใช้ (category = 'staff_role') */
export type CrmSettingRow = StaffRole & {
  category: string
  is_active: boolean
}
