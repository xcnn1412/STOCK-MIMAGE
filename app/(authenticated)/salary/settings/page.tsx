import { redirect } from 'next/navigation'
import { DEPARTMENTS } from '@/lib/departments'
import { getSession } from '../session'
import { getSalarySettings, listDuties, listSalaryProfiles } from './actions'
import SettingsView from './settings-view'

export const revalidate = 0

export const metadata = {
  title: 'ตั้งค่า — เงินเดือน',
  description: 'วันตัดรอบ · rate card หน้าที่หน้างาน · โปรไฟล์เงินเดือนต่อคน',
}

export default async function SalarySettingsPage() {
  const session = await getSession()
  if (!session.userId) redirect('/login')
  // proxy กันระดับโมดูลแล้ว แต่หน้านี้เป็น admin-only ในโมดูล จึงต้องตรวจซ้ำที่นี่
  if (session.role !== 'admin') redirect('/salary')

  const [settings, duties, profiles] = await Promise.all([
    getSalarySettings(),
    listDuties(),
    listSalaryProfiles(),
  ])

  return (
    <SettingsView
      settings={settings}
      duties={duties}
      profiles={profiles}
      departments={DEPARTMENTS}
    />
  )
}
