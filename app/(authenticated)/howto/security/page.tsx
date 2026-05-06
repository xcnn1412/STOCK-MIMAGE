import HowtoView from '../howto-view'

export const revalidate = 0

export const metadata = {
  title: 'คู่มือ Security — Office Hub',
  description: 'ติดตาม login · บัญชีโดนล็อก · session ที่ active · กฎ IP block/allow · timeline เหตุการณ์',
}

export default function HowtoSecurityPage() {
  return <HowtoView view="security" />
}
