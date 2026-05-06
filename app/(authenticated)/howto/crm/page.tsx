import HowtoView from '../howto-view'

export const revalidate = 0

export const metadata = {
  title: 'คู่มือ CRM — Office Hub',
  description: 'บอร์ด Kanban ติดตาม lead · ผ่อนชำระ · มอบหมายทีม · แปลง lead เป็น event',
}

export default function HowtoCrmPage() {
  return <HowtoView view="crm" />
}
