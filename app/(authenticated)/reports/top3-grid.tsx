// การ์ดอันดับ 🥇🥈🥉 Top 3 ของแต่ละประเภทสถิติ — ใช้ทั้ง /reports และ /dashboard
// component แสดงผลล้วน ไม่มี hook/interaction — import ได้ทั้งจาก server และ client component
import { cn } from '@/lib/utils'
import { STAT_KINDS, STAT_LABELS_TH, type PersonStats, type StatKind } from './report-stats'

/** สีประจำประเภท — แถบซ้าย/จุดหน้าชื่อหมวด (ชุดเดียวกับการ์ดสรุปใน /reports) */
export const STAT_COLORS: Record<StatKind, string> = {
    onsite: '#0ea5e9',
    staffing: '#8b5cf6',
    vehicle: '#f59e0b',
    kits: '#10b981',
    graphic: '#ec4899',
    sale: '#16a34a',
    jobs: '#b91c1c',
}

/** เหรียญอันดับ 1-2-3 */
const MEDALS = ['🥇', '🥈', '🥉'] as const

/**
 * เฟรมแชมป์ของแต่ละสาย — ไฟล์จริงใน public/profile frame
 * cx/cy = จุดกลางวงของเฟรม (% ของกว้าง/สูง) · d = เส้นผ่านศูนย์กลางรูป (% ของกว้าง)
 * ตัวเลขวัดจากตำแหน่งวงในภาพแต่ละไฟล์ — เฟรมใหม่เพิ่ม entry ใหม่ได้เลย
 * (sale.png / jobs.png ยังไม่ใช้ — รอมีสถิติยอดขาย/สร้างงาน)
 */
// ตัวเลขวัดจากพิกเซลจริง (flood-fill หารูโปร่งใสกลางเฟรม): จุดกลางวง = ขอบบนรู + เส้นผ่านศูนย์กลางแนวนอน/2
// (ขอบล่างรูโดนริบบิ้นป้ายบัง จึงใช้ความกว้างรูเป็นเส้นผ่านศูนย์กลาง)
// d = ขนาดรูเป๊ะ ห้ามเผื่อเกิน — นอกเส้นวงเป็นพื้นโปร่งใส รูปที่ล้นจะทะลักออกมาให้เห็น
export type FrameKey = StatKind
export interface FrameSpec { src: string; w: number; h: number; cx: number; cy: number; d: number }

export const FRAMES: Partial<Record<FrameKey, FrameSpec>> = {
    onsite: { src: '/profile%20frame/event_2.png', w: 389, h: 360, cx: 49.9, cy: 45.3, d: 78.9 },
    staffing: { src: '/profile%20frame/staff.png', w: 332, h: 361, cx: 49.8, cy: 45.8, d: 94 },
    vehicle: { src: '/profile%20frame/car.png', w: 350, h: 333, cx: 47.3, cy: 49.7, d: 89.1 },
    kits: { src: '/profile%20frame/bags.png', w: 380, h: 339, cx: 52.4, cy: 49.0, d: 81.8 },
    graphic: { src: '/profile%20frame/graphic.png', w: 453, h: 406, cx: 55.1, cy: 49.9, d: 68.9 },
    sale: { src: '/profile%20frame/sale.png', w: 395, h: 356, cx: 52.7, cy: 49.5, d: 84.3 },
    jobs: { src: '/profile%20frame/jobs.png', w: 395, h: 339, cx: 51.6, cy: 48.7, d: 78.7 },
}

/** ความกว้างเฟรม (px) ที่ทำให้ "วงกลม" ของเฟรมมีเส้นผ่านศูนย์กลางตามต้องการ — ใช้จัดทุกเฟรมให้วงเท่ากัน */
export const frameWidthForCircle = (frame: FrameSpec, circlePx: number) => circlePx / (frame.d / 100)

/** รูปโปรไฟล์ในเฟรมแชมป์ — รูปเป็นวงกลมอยู่ใต้เฟรม ตำแหน่ง/ขนาดตาม config ของเฟรมนั้น */
export function FramedAvatar({
    frame,
    avatarUrl,
    name,
    className,
    style,
}: {
    frame: FrameSpec
    avatarUrl: string | null
    name: string
    className?: string
    /** เช่นกำหนด width เป็น px จาก frameWidthForCircle เพื่อให้วงทุกเฟรมเท่ากัน */
    style?: React.CSSProperties
}) {
    const dW = frame.d
    const dH = frame.d * (frame.w / frame.h) // แปลง % ของกว้าง → % ของสูง ให้รูปกลมจริง
    return (
        <div className={cn('relative', className)} style={{ aspectRatio: `${frame.w} / ${frame.h}`, ...style }}>
            <div
                className="absolute flex items-center justify-center overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800"
                style={{
                    width: `${dW}%`,
                    height: `${dH}%`,
                    left: `${frame.cx - dW / 2}%`,
                    top: `${frame.cy - dH / 2}%`,
                }}
            >
                {avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={avatarUrl} alt={name} className="h-full w-full object-cover" />
                ) : (
                    <span className="text-3xl font-bold text-zinc-400">{name.trim().charAt(0)}</span>
                )}
            </div>
            {/* เฟรมทับบนสุด — เจาะวงโปร่งใสตรงกลางอยู่แล้ว */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={frame.src} alt="" className="pointer-events-none absolute inset-0 h-full w-full object-contain" />
        </div>
    )
}

export default function Top3Grid({
    stats,
    currentUserId,
    emptyText = 'ยังไม่มีใครติดอันดับในช่วงนี้',
    gridClassName = 'grid gap-3 sm:grid-cols-2 xl:grid-cols-3',
}: {
    /** ยอดรายคนที่รวมแล้ว (aggregateStats(...).people) */
    stats: PersonStats[]
    currentUserId: string | null
    /** ข้อความของหมวดที่ยังไม่มีใครมียอด */
    emptyText?: string
    /** จำนวนคอลัมน์ของ grid — ส่งทับเมื่อวางในพื้นที่แคบ (เช่นคอลัมน์เดียวบน /dashboard) */
    gridClassName?: string
}) {
    return (
        <div className={gridClassName}>
            {STAT_KINDS.map(kind => {
                const top3 = [...stats]
                    .filter(p => p[kind] > 0)
                    .sort((a, b) => b[kind] - a[kind] || a.name.localeCompare(b.name, 'th'))
                    .slice(0, 3)
                return (
                    <div
                        key={kind}
                        className="relative overflow-hidden rounded-xl border border-zinc-200/60 dark:border-zinc-800/60 bg-white dark:bg-zinc-900/80 p-4"
                    >
                        <div
                            className="absolute left-0 top-0 bottom-0 w-1"
                            style={{ background: `linear-gradient(to bottom, ${STAT_COLORS[kind]}, ${STAT_COLORS[kind]}dd)` }}
                        />
                        <div className="mb-3 flex items-center gap-2">
                            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: STAT_COLORS[kind] }} />
                            <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                                {STAT_LABELS_TH[kind]}
                            </span>
                        </div>
                        {top3.length === 0 ? (
                            <p className="py-2 text-xs text-zinc-400 dark:text-zinc-500">{emptyText}</p>
                        ) : (
                            <>
                                {/* แชมป์สายนี้ — รูปในเฟรมของสาย (ไม่มีเฟรม config = แถวธรรมดาแบบเดิม) */}
                                {(() => {
                                    const champ = top3[0]
                                    const frame = FRAMES[kind]
                                    const isMe = !!currentUserId && champ.userId === currentUserId
                                    if (!frame) return null
                                    return (
                                        <div className="mb-3 flex flex-col items-center">
                                            {/* วงขนาดเดียวกันทุกการ์ด — ความกว้างเฟรมคำนวณย้อนจากขนาดวง */}
                                            <FramedAvatar frame={frame} avatarUrl={champ.avatarUrl} name={champ.name} style={{ width: frameWidthForCircle(frame, 120) }} />
                                            <div className="mt-1.5 flex max-w-full items-center gap-1.5">
                                                <span
                                                    className={cn(
                                                        'truncate text-sm font-semibold',
                                                        isMe ? 'text-amber-900 dark:text-amber-200' : 'text-zinc-900 dark:text-zinc-100'
                                                    )}
                                                >
                                                    {champ.name}
                                                </span>
                                                {isMe && (
                                                    <span className="shrink-0 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                                                        คุณ
                                                    </span>
                                                )}
                                                <span className="shrink-0 text-sm font-bold tabular-nums text-zinc-900 dark:text-zinc-100">
                                                    · {champ[kind]}
                                                </span>
                                            </div>
                                            {champ.department && (
                                                <div className="truncate text-[11px] text-zinc-400 dark:text-zinc-500">{champ.department}</div>
                                            )}
                                        </div>
                                    )
                                })()}
                                <ol className="space-y-2">
                                    {(FRAMES[kind] ? top3.slice(1) : top3).map((p, i) => {
                                        const rank = FRAMES[kind] ? i + 1 : i // มีเฟรม = ลิสต์เริ่มที่อันดับ 2
                                        const isMe = !!currentUserId && p.userId === currentUserId
                                        return (
                                            <li key={p.userId} className="flex items-center gap-2.5">
                                                <span className="w-6 shrink-0 text-center text-lg leading-none">{MEDALS[rank]}</span>
                                                {/* รูปโปรไฟล์ — ไม่มีรูปโชว์อักษรแรกของชื่อ */}
                                                <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800">
                                                    {p.avatarUrl ? (
                                                        // eslint-disable-next-line @next/next/no-img-element
                                                        <img src={p.avatarUrl} alt={p.name} className="h-full w-full object-cover" />
                                                    ) : (
                                                        <span className="text-sm font-bold text-zinc-400">
                                                            {p.name.trim().charAt(0)}
                                                        </span>
                                                    )}
                                                </span>
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center gap-1.5">
                                                        <span
                                                            className={cn(
                                                                'truncate text-sm font-medium',
                                                                isMe
                                                                    ? 'text-amber-900 dark:text-amber-200'
                                                                    : 'text-zinc-900 dark:text-zinc-100'
                                                            )}
                                                        >
                                                            {p.name}
                                                        </span>
                                                        {isMe && (
                                                            <span className="shrink-0 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                                                                คุณ
                                                            </span>
                                                        )}
                                                    </div>
                                                    {p.department && (
                                                        <div className="truncate text-[11px] text-zinc-400 dark:text-zinc-500">
                                                            {p.department}
                                                        </div>
                                                    )}
                                                </div>
                                                <span className="shrink-0 text-sm font-bold tabular-nums text-zinc-900 dark:text-zinc-100">
                                                    {p[kind]}
                                                </span>
                                            </li>
                                        )
                                    })}
                                </ol>
                            </>
                        )}
                    </div>
                )
            })}
        </div>
    )
}
