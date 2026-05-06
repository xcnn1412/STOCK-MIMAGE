import HowtoView from '../howto-view'

export const revalidate = 0

export const metadata = {
  title: 'คู่มือ Check-in — Office Hub',
  description: 'ลงเวลาเข้า-ออก สำหรับออฟฟิศ งานอีเวนต์ ทำงานนอกสถานที่ และคำขอลางาน',
}

export default function HowtoCheckinPage() {
  return <HowtoView view="checkin" />
}
