// คิวรีฝั่ง server ของชั้นเก็บของที่หลายหน้าใช้ร่วมกัน (ไม่ตรวจสิทธิ์ — ผู้เรียกตรวจเอง)
import { createServiceClient } from '@/lib/supabase-server'
import { auditDue } from './shelf-logic'

type Db = ReturnType<typeof createServiceClient>

export interface LastAudit {
  createdAt: string
  missingCount: number
}

/** ตรวจนับครั้งล่าสุดของแต่ละชั้น (shelf_id → ผล) */
export async function latestAuditByShelf(db: Db): Promise<Map<string, LastAudit>> {
  // ponytail: ดึงประวัติทั้งหมดแล้วเลือกแถวแรกต่อชั้น — ใช้ view/DISTINCT ON เมื่อประวัติเยอะจริง
  const { data } = await db.from('shelf_audits').select('shelf_id, created_at, missing').order('created_at', { ascending: false })
  const out = new Map<string, LastAudit>()
  for (const r of data || []) {
    if (out.has(r.shelf_id as string)) continue
    out.set(r.shelf_id as string, {
      createdAt: r.created_at as string,
      missingCount: Array.isArray(r.missing) ? r.missing.length : 0,
    })
  }
  return out
}

export interface ShelfHealth {
  shelfCount: number
  /** ไม่เคยตรวจ หรือไม่ได้ตรวจเกินกำหนด */
  dueShelves: { id: string; code: string; days: number | null }[]
  /** ตรวจครั้งล่าสุดแล้วเจอของขาด */
  missingShelves: { id: string; code: string; missing: number }[]
  kitsWithoutShelf: number
  /** อุปกรณ์ที่ไม่อยู่ในกระเป๋าและยังไม่มีชั้น */
  looseItemsWithoutShelf: number
}

/** สรุปสุขภาพชั้นเก็บของ — การ์ดแจ้งเตือนบนแดชบอร์ดสต็อก */
export async function loadShelfHealth(db: Db, now = new Date()): Promise<ShelfHealth> {
  const [{ data: shelves }, last, { count: kitsWithoutShelf }, { data: looseItems }, { data: inKits }] = await Promise.all([
    db.from('shelves').select('id, code').order('code'),
    latestAuditByShelf(db),
    db.from('kits').select('id', { count: 'exact', head: true }).is('shelf_id', null),
    db.from('items').select('id').is('shelf_id', null),
    db.from('kit_contents').select('item_id'),
  ])
  const inKit = new Set((inKits || []).map(r => r.item_id as string))

  const dueShelves: ShelfHealth['dueShelves'] = []
  const missingShelves: ShelfHealth['missingShelves'] = []
  for (const s of shelves || []) {
    const a = last.get(s.id as string)
    const due = auditDue(a?.createdAt ?? null, now)
    if (due.kind !== 'ok') dueShelves.push({ id: s.id as string, code: s.code as string, days: due.kind === 'never' ? null : due.days })
    if (a && a.missingCount > 0) missingShelves.push({ id: s.id as string, code: s.code as string, missing: a.missingCount })
  }

  return {
    shelfCount: (shelves || []).length,
    dueShelves,
    missingShelves,
    kitsWithoutShelf: kitsWithoutShelf ?? 0,
    looseItemsWithoutShelf: (looseItems || []).filter(i => !inKit.has(i.id as string)).length,
  }
}
