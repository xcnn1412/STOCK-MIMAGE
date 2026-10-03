// โครงระหว่างโหลดของหน้าแรก — ลำดับและคอลัมน์ตรงกับ page.tsx (หน้าไม่กระโดดตอนข้อมูลมา)
import { Skeleton } from '@/components/ui/skeleton'
import { DASH_CARD } from '@/components/dashboard-alerts/dash-card'

function PanelSkeleton({ rows }: { rows: number }) {
    return (
        <div className={`${DASH_CARD} space-y-2`}>
            <Skeleton className="h-5 w-40" />
            {Array.from({ length: rows }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-lg" />
            ))}
        </div>
    )
}

export default function DashboardLoading() {
    return (
        <div className="mx-auto flex w-full max-w-425 flex-col gap-4" aria-busy="true" aria-label="กำลังโหลดหน้าแรก">
            {/* หัวหน้า + ตัวเลข 4 ช่อง */}
            <div className="flex flex-col gap-3 md:order-first lg:flex-row lg:items-end lg:justify-between lg:pr-12">
                <div className="space-y-2">
                    <Skeleton className="h-7 w-28" />
                    <Skeleton className="h-4 w-44" />
                </div>
                <div className="grid grid-cols-4 gap-2 lg:gap-3">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <Skeleton key={i} className="h-15 rounded-xl lg:h-18 lg:w-32" />
                    ))}
                </div>
            </div>

            {/* แผงหลัก */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
                <PanelSkeleton rows={3} />
                <PanelSkeleton rows={3} />
                <div className="lg:col-span-2 xl:col-span-1">
                    <PanelSkeleton rows={2} />
                </div>
            </div>

            {/* ทำเนียบแชมป์ — ล่างสุดบนมือถือ · md ขึ้นไปอยู่ใต้หัวหน้า */}
            <div className={`${DASH_CARD} md:order-first`}>
                <Skeleton className="h-5 w-32" />
                <Skeleton className="mt-3 h-36 w-full rounded-xl md:h-44" />
            </div>
        </div>
    )
}
