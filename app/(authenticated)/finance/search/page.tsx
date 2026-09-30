import { redirect } from 'next/navigation'
import { getFinanceViewer } from '../viewer'
import { normalizeQuery, searchClaims } from '../search-data'
import SearchView from './search-view'

export const revalidate = 0

export const metadata = {
  title: 'ค้นหาใบเบิก — Finance',
  description: 'ค้นหาใบเบิกทุกสถานะทุกเดือน ด้วยเลขที่ หัวข้อ ชื่อผู้เบิก หรือชื่องาน',
}

type Params = Record<string, string | string[] | undefined>

export default async function SearchPage({ searchParams }: { searchParams?: Promise<Params> } = {}) {
  // ทุกคนที่ล็อกอินค้นได้ — พนักงานได้เฉพาะใบของตัวเอง (search-data.ts ผ่าน claimsQuery) · ไม่ล็อกอิน → /login ก่อนอ่านอะไร
  const viewer = await getFinanceViewer()
  if (!viewer) redirect('/login')

  const params = (await searchParams) ?? {}
  const q = normalizeQuery(typeof params.q === 'string' ? params.q : Array.isArray(params.q) ? params.q[0] : '')
  const { hits, truncated, error } = await searchClaims(q, viewer)
  if (error) throw new Error(error)

  return <SearchView q={q} hits={hits} truncated={truncated} isAdmin={viewer.isAdmin} />
}
