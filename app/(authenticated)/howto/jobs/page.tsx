import HowtoView from '../howto-view'

export const revalidate = 0

export const metadata = {
  title: 'คู่มือ Jobs — Office Hub',
  description: 'Kanban งานทีม (graphic + on-site) · บอร์ดส่วนตัว my-job · ระบบ ticket ภายใน',
}

export default function HowtoJobsPage() {
  return <HowtoView view="jobs" />
}
