import { createServiceClient } from '@/lib/supabase-server'
import ContentPlannerView from './content-planner-view'
import type { ContentPost } from './constants'

export const metadata = { title: 'แพลนคอนเทนต์ — Content Planner' }
export const revalidate = 0

// ดึงทุกแถวแบบแบ่งหน้า — `.select()` เดี่ยวๆ ถูก PostgREST ตัดที่ 1000 แถวเงียบๆ
// (แพทเทิร์นเดียวกับ overview/actions.ts และ sales-board/page.tsx)
// เรียง: วันโพสต์ใหม่สุดก่อน (ไม่มีวันที่ไปท้าย) → สร้างล่าสุด → id (กันแถวข้าม/ซ้ำระหว่างหน้า)
async function fetchAllPosts(): Promise<ContentPost[]> {
  const supabase = createServiceClient()
  const rows: ContentPost[] = []
  let from = 0
  const step = 1000
  for (;;) {
    const { data, error } = await supabase
      .from('content_posts')
      .select('*')
      .order('post_date', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .order('id', { ascending: true })
      .range(from, from + step - 1)
    if (error || !data) break
    rows.push(...(data as ContentPost[]))
    if (data.length < step) break
    from += step
  }
  return rows
}

// รายชื่อ "ผู้รับผิดชอบ" = user ที่เข้าหน้านี้ได้ (มีสิทธิ์ content หรือเป็น admin)
async function fetchOwnerOptions(): Promise<string[]> {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('profiles')
    .select('full_name, nickname, role, allowed_modules, is_approved')
    .eq('is_approved', true)
  return (data || [])
    .filter(p => p.role === 'admin' || ((p.allowed_modules as string[] | null) || []).includes('content'))
    .map(p => (p.nickname ? `${p.nickname} - ${p.full_name}` : p.full_name) as string)
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, 'th'))
}

// เข้าได้เฉพาะผู้มี module 'content' — บังคับที่ proxy.ts MODULE_ROUTES
export default async function ContentPlannerPage() {
  const [posts, ownerOptions] = await Promise.all([fetchAllPosts(), fetchOwnerOptions()])
  return <ContentPlannerView posts={posts} ownerOptions={ownerOptions} />
}
