// แถวทำเนียบแชมป์ — เฟรมทุกสาย (STAT_KINDS.length) เรียงแนวนอน (ใช้บนหัวหน้า /dashboard กับยอดสะสมทั้งหมด)
// component แสดงผลล้วน ไม่มี hook — import ได้จาก server component
import { cn } from '@/lib/utils'
import { STAT_KINDS, type PersonStats, type StatKind } from './report-stats'
import { FRAMES, FramedAvatar, type FrameKey } from './top3-grid'

// ขนาดทั้งแถวคิดจากเส้นผ่านศูนย์กลางวง --c (ทุกเฟรมถูกย่อ/ขยายให้วงเท่ากัน):
//   การ์ดกว้าง ≥ 700px → --c = ใหญ่ที่สุดที่ทุกช่อง (STAT_KINDS.length) ยังพอดีความกว้างการ์ด (56–104px) — การ์ดแคบจนวงต่ำกว่า 56px จะเลื่อนซ้ายขวาแทน
//   การ์ดแคบกว่านั้น (มือถือ) → วง 64px แล้วเลื่อนซ้ายขวา
/** ช่องหนึ่งกว้างกี่เท่าของวง (เผื่อชื่อใต้เฟรม) */
const TILE_PER_CIRCLE = 1.54
/** กล่องเฟรมสูงกี่เท่าของวง — เท่ากับเฟรมที่สูงสุดหลัง normalize (graphic) เฟรมอื่นชิดล่างให้ป้ายเรียงแนวเดียวกัน */
const BOX_PER_CIRCLE = 1.31
/** ช่องว่างรวมในแถว: (จำนวนช่อง − 1) ช่องไฟ × 16px + ขอบขวา 32px (pr-8) */
const ROW_SPACING_PX = (STAT_KINDS.length - 1) * 16 + 32
/** วงที่ทำให้ทุกช่องพอดีความกว้างการ์ด (cqw = ความกว้างของ @container ชั้นนอก) */
const CIRCLE_FIT = `calc((100cqw - ${ROW_SPACING_PX}px) / ${STAT_KINDS.length} / ${TILE_PER_CIRCLE})`

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
        // ขอบขวาจางลง (mask) = บอกใบ้ว่าเลื่อนต่อได้ · pr-8 ในชั้นใน ให้แชมป์คนสุดท้ายพ้นช่วงจางเมื่อเลื่อนสุด
        <div
            className={cn('@container overflow-x-auto pb-2', className)}
            style={{
                scrollbarWidth: 'none',
                msOverflowStyle: 'none',
                maskImage: 'linear-gradient(to right, black calc(100% - 32px), transparent)',
                WebkitMaskImage: 'linear-gradient(to right, black calc(100% - 32px), transparent)',
            }}
        >
            <div
                className="mx-auto flex w-max gap-4 snap-x pr-8 [--c:64px] @[700px]:[--c:clamp(56px,var(--c-fit),104px)]"
                style={{ ['--c-fit' as string]: CIRCLE_FIT }}
            >
            {STRIP_ORDER.map(key => {
                const frame = FRAMES[key]
                if (!frame) return null
                const champ = championOf(stats, key)
                const isMe = !!champ && !!currentUserId && champ.userId === currentUserId
                return (
                    <div
                        key={key}
                        className="flex shrink-0 snap-start flex-col items-center"
                        style={{ width: `calc(var(--c) * ${TILE_PER_CIRCLE})` }}
                    >
                        {/* กล่องสูงตามวง ชิดล่าง — วงทุกเฟรมเท่ากัน (--c) และป้ายล่างเรียงแนวเดียวกัน */}
                        <div className="flex items-end justify-center" style={{ height: `calc(var(--c) * ${BOX_PER_CIRCLE})` }}>
                            <FramedAvatar
                                frame={frame}
                                avatarUrl={champ?.avatarUrl ?? null}
                                name={champ?.name ?? '?'}
                                // ความกว้างเฟรมที่ทำให้วงของเฟรมนี้ = --c (สูตรเดียวกับ frameWidthForCircle)
                                style={{ width: `calc(var(--c) * ${(100 / frame.d).toFixed(4)})` }}
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
                                        <span className="shrink-0 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
                                            คุณ
                                        </span>
                                    )}
                                </div>
                                <div className="text-xs text-zinc-500 dark:text-zinc-400 tabular-nums">
                                    จำนวน {champ[key]} งาน
                                </div>
                            </>
                        ) : (
                            <div className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">ยังไม่มีแชมป์</div>
                        )}
                    </div>
                )
            })}
            </div>
        </div>
    )
}
