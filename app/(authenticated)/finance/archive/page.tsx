import { redirect } from 'next/navigation'
import { getFinanceCategories } from '../settings-actions'
import { getFinanceViewer } from '../viewer'
import { getArchivePage, parseArchiveQuery } from '../archive-data'
import ArchiveList from './archive-list'

export const revalidate = 0

export const metadata = {
  title: 'คลังเก็บ — Finance',
  description: 'คลังเก็บใบเบิกที่ชำระเงินแล้ว',
}

type Params = Record<string, string | string[] | undefined>

export default async function ArchivePage({ searchParams }: { searchParams?: Promise<Params> } = {}) {
  // พนักงานเข้าได้ (ดูใบที่จ่ายแล้วของตัวเอง — claimsQuery กรองตามผู้เบิกให้เอง)
  const viewer = await getFinanceViewer()
  if (!viewer) redirect('/login')

  // ตัวกรองทั้งหมดอยู่ใน URL (ส่งต่อให้คนอื่นได้) · หน้าละ 50 ใบ กรองและรวมยอดในฐานข้อมูล
  const query = parseArchiveQuery((await searchParams) ?? {})
  const [archive, categories] = await Promise.all([
    getArchivePage(viewer, query),
    getFinanceCategories(),
  ])
  // อ่านฐานข้อมูลไม่สำเร็จ → หน้าข้อผิดพลาดของส่วนใบเบิก (error.tsx) แทนคลังเก็บว่างที่ดูเหมือนไม่มีใบ
  if (!archive.data) throw new Error(archive.error || 'โหลดคลังเก็บไม่สำเร็จ')

  return <ArchiveList {...archive.data} categories={categories} />
}
