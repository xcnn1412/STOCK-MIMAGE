import { redirect } from 'next/navigation'
import { getFinanceCategories } from '../settings-actions'
import { getFinanceViewer } from '../viewer'
import { getWhtCells, getWhtPeople } from '../report-data'
import FinanceDownloadView from './finance-download-view'

export const revalidate = 0

export const metadata = {
  title: 'หัก ณ ที่จ่าย 3% — Finance',
  description: 'สรุปหัก ณ ที่จ่ายรายบุคคล สำหรับออกหนังสือรับรองและยื่น ภ.ง.ด.3 / 53',
}

export default async function DownloadPage() {
  // หน้านี้มีเลขบัตรประชาชนและที่อยู่ — แอดมินเท่านั้น ตรวจก่อนอ่านอะไรจากฐานข้อมูล
  const viewer = await getFinanceViewer()
  if (!viewer) redirect('/login')
  if (!viewer.isAdmin) redirect('/finance')

  // ยอดรวมต่อ (ผู้เบิก, สถานะ, เดือน) ของใบที่มีหัก ณ ที่จ่าย แทนแถวใบเบิก — หน้าจอรวมกลุ่มตามตัวกรองเอง
  const [cells, categories] = await Promise.all([
    getWhtCells(viewer),
    getFinanceCategories(),
  ])
  if (cells.error) throw new Error(cells.error)

  // ชื่อและข้อมูลส่วนตัวเฉพาะคนที่มีใบหัก ณ ที่จ่าย — ไม่อ่าน/ไม่ส่งของทุกคนในระบบ
  const { people, profileMap, error } = await getWhtPeople(viewer, cells.data)
  if (error) throw new Error(error)

  return (
    <FinanceDownloadView
      cells={cells.data}
      people={people}
      profileMap={profileMap}
      categories={categories}
    />
  )
}
