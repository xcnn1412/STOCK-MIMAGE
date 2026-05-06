import HowtoView from '../howto-view'

export const revalidate = 0

export const metadata = {
  title: 'คู่มือ Events — Office Hub',
  description: 'จัดการงานลูกค้าครบวงจร — สร้าง / ตรวจของ / on-site / เช็คคืน / ปิดงาน',
}

export default function HowtoEventsPage() {
  return <HowtoView view="events" />
}
