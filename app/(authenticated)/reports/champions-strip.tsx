// แถวทำเนียบแชมป์ — เฟรมทั้ง 7 เรียงแนวนอน (ใช้บนหัวหน้า /dashboard กับยอดสะสมทั้งหมด)
// component แสดงผลล้วน ไม่มี hook — import ได้จาก server component
import { cn } from '@/lib/utils'
import { STAT_KINDS, type PersonStats, type StatKind } from './report-stats'
import { FRAMES, FramedAvatar, frameWidthForCircle, type FrameKey } from './top3-grid'

/** เส้นผ่านศูนย์กลางวง (px) — ทุกเฟรมถูกย่อ/ขยายให้วงเท่ากันค่านี้ */
const CIRCLE_PX = 104
/** ความสูงกล่องเฟรม — เท่ากับเฟรมที่สูงสุดหลัง normalize (graphic) เฟรมอื่นชิดล่างให้ป้ายเรียงแนวเดียวกัน */
const FRAME_BOX_PX = 136

/** ลำดับเฟรมบนแถว — ครบทุกสายสถิติ (รวมยอดนักขาย/สร้างใบงาน) */
const STRIP_ORDER: FrameKey[] = [...STAT_KINDS]

/** แชมป์ของสายหนึ่ง = คนที่ยอดสายนั้นมากสุด (0 = ไม่มีแชมป์) */
function championOf(stats: PersonStats[], kind: StatKind): PersonStats | null {
    let best: PersonStats | null = null
    for (const p of stats) {
        if (p[kind] === 0) continue
        if (!best || p[kind] > best[kind] || (p[kind] === best[kind] && p.name.localeCompare(best.name, 'th') < 0)) best = p
    }
    return best
}

export default function ChampionsStrip({
    stats,
    currentUserId,
    className,
}: {
    /** ยอดรายคนที่รวมแล้วของช่วงที่ใช้ตัดสินแชมป์ (dashboard ใช้ภาพรวมทั้งหมด) */
    stats: PersonStats[]
    currentUserId: string | null
    className?: string
}) {
    return (
        // ชั้นนอก scroll ได้เมื่อจอแคบ · ชั้นใน w-max + mx-auto = อยู่กึ่งกลางเมื่อจอกว้างพอ
        <div className={cn('overflow-x-auto pb-2', className)} style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
            <div className="mx-auto flex w-max gap-4 snap-x">
            {STRIP_ORDER.map(key => {
                const frame = FRAMES[key]
                if (!frame) return null
                const champ = championOf(stats, key)
                const isMe = !!champ && !!currentUserId && champ.userId === currentUserId
                return (
                    <div key={key} className="flex w-40 shrink-0 snap-start flex-col items-center">
                        {/* กล่องสูงคงที่ ชิดล่าง — วงทุกเฟรมเท่ากัน (CIRCLE_PX) และป้ายล่างเรียงแนวเดียวกัน */}
                        <div className="flex items-end justify-center" style={{ height: FRAME_BOX_PX }}>
                            <FramedAvatar
                                frame={frame}
                                avatarUrl={champ?.avatarUrl ?? null}
                                name={champ?.name ?? '?'}
                                style={{ width: frameWidthForCircle(frame, CIRCLE_PX) }}
                            />
                        </div>
                        {champ ? (
                            <>
                                <div className="mt-1 flex max-w-full items-center gap-1">
                                    <span
                                        className={cn(
                                            'truncate text-xs font-semibold',
                                            isMe ? 'text-amber-700 dark:text-amber-300' : 'text-zinc-900 dark:text-zinc-100'
                                        )}
                                    >
                                        {champ.name}
                                    </span>
                                    {isMe && (
                                        <span className="shrink-0 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-amber-700 dark:text-amber-300">
                                            คุณ
                                        </span>
                                    )}
                                </div>
                                <div className="text-[11px] text-zinc-500 dark:text-zinc-400 tabular-nums">
                                    จำนวน {champ[key]} งาน
                                </div>
                            </>
                        ) : (
                            <div className="mt-1 text-[11px] text-zinc-400 dark:text-zinc-500">ยังไม่มีแชมป์</div>
                        )}
                    </div>
                )
            })}
            </div>
        </div>
    )
}
