import { Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { UPDATES, type UpdateTag } from './updates'

export const metadata = { title: 'มีอะไรใหม่ — What\'s New' }

// หน้า static ล้วน (ข้อมูลจาก updates.ts) — ไม่ต้องแยก view client component
const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
const thDate = (d: string) => {
  const [y, m, day] = d.split('-').map(Number)
  return `${day} ${TH_MONTHS[m - 1]} ${y + 543}`
}

const TAG_STYLE: Record<UpdateTag, string> = {
  'ใหม่': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  'ปรับปรุง': 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
  'แก้บั๊ก': 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
}

export default function WhatsNewPage() {
  // จัดกลุ่มตามวัน (entries ใน updates.ts เรียงใหม่→เก่าอยู่แล้ว)
  const byDate: { date: string; items: typeof UPDATES }[] = []
  for (const u of UPDATES) {
    const g = byDate[byDate.length - 1]
    if (g && g.date === u.date) g.items.push(u)
    else byDate.push({ date: u.date, items: [u] })
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-fuchsia-500 to-violet-600 text-white shadow-md">
          <Sparkles className="h-6 w-6" />
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">มีอะไรใหม่</h1>
          <p className="text-sm text-muted-foreground">อัปเดตฟีเจอร์และการแก้ไขล่าสุดของระบบ</p>
        </div>
      </div>

      <div className="relative space-y-8 border-l-2 border-muted pl-6">
        {byDate.map((g) => (
          <section key={g.date}>
            <div className="relative mb-3">
              <span className="absolute -left-[31px] top-1 h-3 w-3 rounded-full border-2 border-background bg-violet-500" />
              <h2 className="text-sm font-bold text-muted-foreground">{thDate(g.date)}</h2>
            </div>
            <div className="space-y-3">
              {g.items.map((u, i) => (
                <article key={i} className="rounded-xl border bg-card p-4 shadow-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-bold', TAG_STYLE[u.tag])}>{u.tag}</span>
                    <span className="text-xs font-semibold text-muted-foreground">{u.module}</span>
                  </div>
                  <h3 className="mt-1.5 font-semibold leading-snug">{u.title}</h3>
                  {u.points && (
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                      {u.points.map((p, j) => <li key={j}>{p}</li>)}
                    </ul>
                  )}
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
