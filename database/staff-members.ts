// ============================================================================
// Staff Members Database
// ข้อมูลพนักงาน — เพิ่ม/แก้ไขข้อมูลได้ที่ไฟล์นี้
// ============================================================================

export interface StaffMember {
  id: string
  name: string       // ชื่อ-นามสกุล
  nickname?: string  // ชื่อเล่น
  role?: string      // ตำแหน่ง
  active: boolean    // ยังทำงานอยู่หรือไม่
}

export const STAFF_MEMBERS: StaffMember[] = [
  { id: 'staff-001', name: 'Manow Budlada', nickname: 'มะนาว', role: 'Photographer', active: true },
  { id: 'staff-002', name: 'Jessica', nickname: 'เจสซิก้า', role: 'Staff', active: true },
  { id: 'staff-003', name: 'Aurora', nickname: 'ออโรร่า', role: 'Staff', active: true },
  // เพิ่มพนักงานเพิ่มเติมได้ที่นี่
]

// Helper: ดึงเฉพาะคนที่ยัง active
export function getActiveStaff(): StaffMember[] {
  return STAFF_MEMBERS.filter(s => s.active)
}

// Helper: แสดงชื่อ + ชื่อเล่น
export function getStaffDisplayName(staff: StaffMember): string {
  return staff.nickname ? `${staff.name} (${staff.nickname})` : staff.name
}
