import HowtoView from '../howto-view'

export const revalidate = 0

export const metadata = {
  title: 'คู่มือเงินเดือน — Office Hub',
  description: 'คู่มือโมดูลเงินเดือน: พนักงานดูสลิปของตัวเอง แอดมินตั้งค่า เปิดงวด คำนวณ ปิดงวด และจ่ายเงิน ทีละขั้น',
}

export default function HowtoSalaryPage() {
  return <HowtoView view="salary" />
}
