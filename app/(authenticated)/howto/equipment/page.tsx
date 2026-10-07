import HowtoView from '../howto-view'

export const revalidate = 0

export const metadata = {
  title: 'คู่มือ flow อุปกรณ์ — Office Hub',
  description: 'คู่มือ flow อุปกรณ์ทั้งเส้น: ตั้งค่า เลือกแพ็กเกจ จัดของ รับของ คืนของ คืนชั้น และดูการใช้งาน แยกตามฝ่าย',
}

export default function HowtoEquipmentPage() {
  return <HowtoView view="equipment" />
}
