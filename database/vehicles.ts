// ============================================================================
// Vehicles Database
// ข้อมูลรถยนต์ — เพิ่ม/แก้ไขข้อมูลได้ที่ไฟล์นี้
// ============================================================================

export interface Vehicle {
  id: string
  licensePlate: string  // ป้ายทะเบียน
  name: string          // ชื่อ/รุ่นรถ
  type?: string         // ประเภท (รถตู้, รถกระบะ, รถเก๋ง)
  active: boolean       // ยังใช้งานอยู่หรือไม่
}

export const VEHICLES: Vehicle[] = [
  { id: 'vehicle-001', licensePlate: 'กก 1234', name: 'Toyota Hiace', type: 'รถตู้', active: true },
  { id: 'vehicle-002', licensePlate: 'ขข 5678', name: 'Toyota Hilux Revo', type: 'รถกระบะ', active: true },
  { id: 'vehicle-003', licensePlate: 'คค 9012', name: 'Honda City', type: 'รถเก๋ง', active: true },
  // เพิ่มรถเพิ่มเติมได้ที่นี่
]

// Helper: ดึงเฉพาะรถที่ยัง active
export function getActiveVehicles(): Vehicle[] {
  return VEHICLES.filter(v => v.active)
}

// Helper: แสดง ป้ายทะเบียน + ชื่อรถ
export function getVehicleDisplayName(vehicle: Vehicle): string {
  return `${vehicle.licensePlate} — ${vehicle.name}`
}
