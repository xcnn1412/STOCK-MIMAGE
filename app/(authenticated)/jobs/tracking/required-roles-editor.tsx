'use client'

// "ตำแหน่งที่ต้องการ" ของงานหนึ่ง — controlled component ตัวเดียว ใช้ทั้งการ์ดข้อมูลอีเวนต์ใน CRM
// และหน้าต่างจัดคนใน /jobs/tracking (ลำดับตำแหน่งตามลำดับที่ผู้ใช้เพิ่ม = ลำดับ key ใน record)

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, X } from 'lucide-react'

export interface StaffRoleOption {
    value: string
    label: string
}

const MAX_COUNT = 20

function toRecord(entries: [string, number][]): Record<string, number> {
    const out: Record<string, number> = {}
    for (const [role, count] of entries) if (role) out[role] = count
    return out
}

function labelOf(role: string, roles: StaffRoleOption[]): string {
    return roles.find(r => r.value === role)?.label || role
}

export function RequiredRolesEditor({ value, roles, onChange }: {
    value: Record<string, number>
    roles: StaffRoleOption[]
    onChange: (value: Record<string, number>) => void
}) {
    const entries = Object.entries(value) as [string, number][]
    const unused = roles.filter(r => !(r.value in value))
    const setEntries = (next: [string, number][]) => onChange(toRecord(next))

    /** ตำแหน่งที่เลือกได้ในแถวนี้: ของตัวเอง + ที่ยังไม่ถูกใช้ (ตำแหน่งแปลกที่ค้างอยู่ไม่หายไปเงียบๆ) */
    const optionsFor = (role: string): StaffRoleOption[] => {
        const list = roles.filter(r => r.value === role || !(r.value in value))
        return roles.some(r => r.value === role) ? list : [{ value: role, label: role }, ...list]
    }

    return (
        <div className="space-y-2">
            {entries.length === 0 && (
                <p className="text-xs text-zinc-500">ยังไม่กำหนดตำแหน่ง</p>
            )}
            {entries.map(([role, count], i) => (
                <div key={role} className="flex items-center gap-2">
                    <Select
                        value={role}
                        onValueChange={v => setEntries(entries.map((e, j) => (j === i ? [v, e[1]] : e)))}
                    >
                        <SelectTrigger className="h-8 flex-1 text-sm">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {optionsFor(role).map(r => (
                                <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Input
                        type="number"
                        min={1}
                        max={MAX_COUNT}
                        value={count}
                        aria-label={`จำนวน ${labelOf(role, roles)}`}
                        className="h-8 w-16 text-sm"
                        onChange={e => {
                            const n = Math.max(1, Math.min(MAX_COUNT, Math.floor(Number(e.target.value) || 1)))
                            setEntries(entries.map((x, j) => (j === i ? [x[0], n] : x)))
                        }}
                    />
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        aria-label={`ลบ ${labelOf(role, roles)}`}
                        onClick={() => setEntries(entries.filter((_, j) => j !== i))}
                    >
                        <X className="h-3.5 w-3.5" />
                    </Button>
                </div>
            ))}
            {unused.length > 0 && (
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8"
                    onClick={() => setEntries([...entries, [unused[0].value, 1]])}
                >
                    <Plus className="h-3.5 w-3.5" /> เพิ่มตำแหน่ง
                </Button>
            )}
        </div>
    )
}

/** อ่านอย่างเดียว: `ช่างกล้อง 1 · ผู้ช่วย 2` หรือข้อความจางเมื่อยังไม่กำหนด */
export function RequiredRolesSummary({ value, roles }: {
    value: Record<string, number>
    roles: StaffRoleOption[]
}) {
    const entries = Object.entries(value)
    if (entries.length === 0) {
        return <span className="text-zinc-400 dark:text-zinc-500">ยังไม่กำหนดตำแหน่ง</span>
    }
    return <>{entries.map(([role, count]) => `${labelOf(role, roles)} ${count}`).join(' · ')}</>
}
