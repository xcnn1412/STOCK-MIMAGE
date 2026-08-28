import { notFound, redirect } from 'next/navigation'
import { getSession } from '../session'
import { getSlipForView } from '../actions'
import SlipView from './slip-view'

export const revalidate = 0

export const metadata = {
  title: 'สลิปเงินเดือน',
  description: 'รายละเอียดสลิปเงินเดือนหนึ่งงวด',
}

export default async function SalarySlipPage({ params }: { params: Promise<{ slipId: string }> }) {
  const { slipId } = await params

  const session = await getSession()
  if (!session.userId) redirect('/login')

  // สิทธิ์บังคับใน getSlipForView: admin เห็นทุกใบ · เจ้าของเห็นเฉพาะที่ปิดงวดแล้ว
  // · คนอื่นไม่เห็นเลย — ทุกกรณีคืน error เหมือนกัน จึงลงเอยที่ notFound() เสมอ
  const res = await getSlipForView(slipId)
  if ('error' in res) notFound()

  // ไม่ใช่ admin = เจ้าของสลิป: ได้เช็คอินของตัวเองเฉพาะที่จ่ายในสลิปใบนี้ (อ่านอย่างเดียว)
  // + รายชื่อหน้าที่ไว้แปลงรหัสเป็นชื่อ แต่ไม่ได้ลิสต์อีเวนต์ของทั้งบริษัท — บังคับใน action
  return (
    <SlipView
      slip={res.slip}
      isAdmin={res.isAdmin}
      checkins={res.checkins}
      duties={res.duties}
      events={res.events}
    />
  )
}
