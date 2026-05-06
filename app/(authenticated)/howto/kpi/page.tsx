import HowtoView from '../howto-view'

export const revalidate = 0

export const metadata = {
  title: 'คู่มือ KPI — Office Hub',
  description: 'ตั้งเป้า / รับผลจริง / คำนวณคะแนน — leaderboard + reports + feedback timeline',
}

export default function HowtoKpiPage() {
  return <HowtoView view="kpi" />
}
