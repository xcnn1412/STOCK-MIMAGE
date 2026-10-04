// Supabase จำลองในหน่วยความจำ สำหรับ lib/mcp-tools.check.ts และ scripts/mcp-e2e.check.ts
// รองรับเฉพาะส่วนของ query builder ที่ tool ของ MCP / getTrackingSnapshot / lib/oauth / logger ใช้:
// select (คอลัมน์ + ตารางซ้อน alias:rel!hint(...)), eq neq is in gt gte lt lte ilike or order limit,
// maybeSingle single, count/head, insert update (+ select คืนแถว)
// ทุกการเขียนถูกบันทึกใน writes — สคริปต์ตรวจว่า tool ไม่เขียนอะไรเลย

import { randomUUID } from 'node:crypto'

export type Row = Record<string, unknown>
/** ความสัมพันธ์: แถวลูกที่ child[foreign] === parent[local] · one = แถวเดียว (หรือ null) · many = อาร์เรย์ */
export interface Rel { table: string; kind: 'one' | 'many'; local: string; foreign: string }

export const RELS: Record<string, Record<string, Rel>> = {
  items: {
    shelves: { table: 'shelves', kind: 'one', local: 'shelf_id', foreign: 'id' },
    kit_contents: { table: 'kit_contents', kind: 'many', local: 'id', foreign: 'item_id' },
  },
  kit_contents: {
    kits: { table: 'kits', kind: 'one', local: 'kit_id', foreign: 'id' },
    items: { table: 'items', kind: 'one', local: 'item_id', foreign: 'id' },
  },
  kits: {
    shelves: { table: 'shelves', kind: 'one', local: 'shelf_id', foreign: 'id' },
    events: { table: 'events', kind: 'one', local: 'event_id', foreign: 'id' },
    kit_contents: { table: 'kit_contents', kind: 'many', local: 'id', foreign: 'kit_id' },
  },
  event_kits: {
    events: { table: 'events', kind: 'one', local: 'event_id', foreign: 'id' },
    kits: { table: 'kits', kind: 'one', local: 'kit_id', foreign: 'id' },
  },
  event_staff: {
    user_id: { table: 'profiles', kind: 'one', local: 'user_id', foreign: 'id' },
  },
  event_closures: {
    profiles: { table: 'profiles', kind: 'one', local: 'closed_by', foreign: 'id' },
  },
  shelf_audits: {
    audited_by: { table: 'profiles', kind: 'one', local: 'audited_by', foreign: 'id' },
  },
  activity_logs: {
    user_id: { table: 'profiles', kind: 'one', local: 'user_id', foreign: 'id' },
  },
}

type Err = { message: string; code?: string } | null
type Result = { data: unknown; error: Err; count?: number | null }

interface Node { field?: string; rel?: { key: string; alias: string; inner: boolean; children: Node[] } }

/** แยกด้วย , ที่ระดับบนสุด (ไม่ตัดในวงเล็บ) */
function splitTop(s: string): string[] {
  const out: string[] = []
  let depth = 0
  let cur = ''
  for (const ch of s) {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (ch === ',' && depth === 0) {
      out.push(cur.trim())
      cur = ''
    } else cur += ch
  }
  if (cur.trim()) out.push(cur.trim())
  return out
}

function parseSelect(s: string): Node[] {
  return splitTop(s.replace(/\s+/g, ' ')).map(tok => {
    const open = tok.indexOf('(')
    if (open < 0) return { field: tok.trim() }
    const head = tok.slice(0, open).trim()
    const inner = tok.slice(open + 1, tok.lastIndexOf(')'))
    const [aliasPart, relPart] = head.includes(':') ? head.split(':') : [null, head]
    const [key, hint] = relPart.split('!')
    return { rel: { key: key.trim(), alias: (aliasPart ?? key).trim(), inner: hint === 'inner', children: parseSelect(inner) } }
  })
}

function likeToRegex(pattern: string): RegExp {
  let re = ''
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i]
    if (ch === '\\' && i + 1 < pattern.length) re += pattern[++i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    else if (ch === '%') re += '.*'
    else if (ch === '_') re += '.'
    else re += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }
  return new RegExp(`^${re}$`, 'is')
}

type Get = (path: string) => unknown
type Pred = (get: Get) => boolean

function opPred(col: string, op: string, raw: string): Pred {
  const val: unknown = raw === 'null' ? null : raw === 'true' ? true : raw === 'false' ? false : raw
  switch (op) {
    case 'eq': return g => g(col) === val
    case 'neq': return g => g(col) !== val
    case 'is': return g => (g(col) ?? null) === val
    case 'gt': return g => g(col) != null && String(g(col)) > String(val)
    case 'gte': return g => g(col) != null && String(g(col)) >= String(val)
    case 'lt': return g => g(col) != null && String(g(col)) < String(val)
    case 'lte': return g => g(col) != null && String(g(col)) <= String(val)
    case 'ilike': {
      const re = likeToRegex(String(raw))
      return g => typeof g(col) === 'string' && re.test(g(col) as string)
    }
    default: throw new Error(`fake-db: ไม่รองรับ operator ${op}`)
  }
}

/** or('a.ilike.%x%,and(b.is.null,c.gte.2026-01-01)') */
function parseOr(expr: string, all = false): Pred {
  const preds = splitTop(expr).map(term => {
    if (term.startsWith('and(')) return parseOr(term.slice(4, -1), true)
    if (term.startsWith('or(')) return parseOr(term.slice(3, -1))
    const a = term.indexOf('.')
    const b = term.indexOf('.', a + 1)
    return opPred(term.slice(0, a), term.slice(a + 1, b), term.slice(b + 1))
  })
  return all ? g => preds.every(p => p(g)) : g => preds.some(p => p(g))
}

export interface FakeDb {
  tables: Record<string, Row[]>
  writes: { table: string; op: string }[]
  /** ตารางที่ทำให้คิวรี throw (จำลองฐานข้อมูลล่ม) */
  failTables: Set<string>
  client: { from(table: string): Query }
}

class Query implements PromiseLike<Result> {
  private preds: Pred[] = []
  private op: 'select' | 'insert' | 'update' = 'select'
  private nodes: Node[] = [{ field: '*' }]
  private payload: Row[] = []
  private patch: Row = {}
  private returning = false
  private orders: { col: string; asc: boolean; nullsFirst: boolean }[] = []
  private max: number | null = null
  private countMode = false
  private head = false
  constructor(private fake: FakeDb, private table: string) {}

  select(cols = '*', opts?: { count?: string; head?: boolean }) {
    if (this.op !== 'select') this.returning = true
    else this.nodes = parseSelect(cols)
    this.countMode = !!opts?.count
    this.head = !!opts?.head
    return this
  }
  insert(v: Row | Row[]) { this.op = 'insert'; this.payload = Array.isArray(v) ? v : [v]; return this }
  update(p: Row) { this.op = 'update'; this.patch = p; return this }
  eq(c: string, v: unknown) { this.preds.push(g => g(c) === v); return this }
  neq(c: string, v: unknown) { this.preds.push(g => g(c) !== v); return this }
  is(c: string, v: null) { this.preds.push(g => (g(c) ?? null) === v); return this }
  in(c: string, vs: unknown[]) { this.preds.push(g => vs.includes(g(c))); return this }
  gt(c: string, v: string) { this.preds.push(opPred(c, 'gt', v)); return this }
  gte(c: string, v: string) { this.preds.push(opPred(c, 'gte', v)); return this }
  lt(c: string, v: string) { this.preds.push(opPred(c, 'lt', v)); return this }
  lte(c: string, v: string) { this.preds.push(opPred(c, 'lte', v)); return this }
  ilike(c: string, p: string) { this.preds.push(opPred(c, 'ilike', p)); return this }
  or(expr: string) { this.preds.push(parseOr(expr)); return this }
  order(col: string, o?: { ascending?: boolean; nullsFirst?: boolean }) {
    const asc = o?.ascending ?? true
    this.orders.push({ col, asc, nullsFirst: o?.nullsFirst ?? !asc })
    return this
  }
  limit(n: number) { this.max = n; return this }

  private rowsOf(table: string): Row[] {
    const rows = this.fake.tables[table]
    if (!rows) throw new Error(`fake-db: ตารางไม่รู้จัก ${table}`)
    return rows
  }

  /** แถวพร้อมตารางซ้อนตาม nodes */
  private shape(table: string, row: Row, nodes: Node[]): Row | null {
    const out: Row = {}
    for (const n of nodes) {
      if (n.field === '*') Object.assign(out, row)
      else if (n.field) out[n.field] = row[n.field] ?? null
      else if (n.rel) {
        const rel = RELS[table]?.[n.rel.key] ?? RELS[table]?.[n.rel.alias]
        if (!rel) throw new Error(`fake-db: ไม่รู้จักความสัมพันธ์ ${table}.${n.rel.key}`)
        const kids = this.rowsOf(rel.table).filter(c => c[rel.foreign] === row[rel.local])
        const shaped = kids.map(k => this.shape(rel.table, k, n.rel!.children)).filter((k): k is Row => !!k)
        if (rel.kind === 'one') {
          if (n.rel.inner && shaped.length === 0) return null
          out[n.rel.alias] = shaped[0] ?? null
        } else out[n.rel.alias] = shaped
      }
    }
    return out
  }

  private run(): Result {
    if (this.fake.failTables.has(this.table)) throw new Error(`fake-db: ${this.table} ล่ม (จำลอง)`)
    const rows = this.rowsOf(this.table)
    if (this.op === 'insert') {
      this.fake.writes.push({ table: this.table, op: 'insert' })
      const added = this.payload.map(p => ({ id: randomUUID(), created_at: new Date().toISOString(), ...p }))
      rows.push(...added)
      return { data: added.map(r => ({ ...r })), error: null }
    }
    const shaped = rows
      .map(r => ({ raw: r, shaped: this.shape(this.table, r, this.op === 'select' ? this.nodes : [{ field: '*' }]) }))
      .filter((x): x is { raw: Row; shaped: Row } => !!x.shaped)
    const get = (x: { raw: Row; shaped: Row }): Get => path => {
      if (!path.includes('.')) return x.raw[path]
      const [rel, col] = path.split('.')
      const v = x.shaped[rel]
      return v && typeof v === 'object' ? (v as Row)[col] : undefined
    }
    const hit = shaped.filter(x => this.preds.every(p => p(get(x))))
    if (this.op === 'update') {
      this.fake.writes.push({ table: this.table, op: 'update' })
      for (const x of hit) Object.assign(x.raw, this.patch)
      return { data: hit.map(x => ({ ...x.raw })), error: null }
    }
    let out = hit.map(x => x.shaped)
    if (this.orders.length) {
      out = [...out].sort((a, b) => {
        for (const o of this.orders) {
          const av = a[o.col] ?? null
          const bv = b[o.col] ?? null
          if (av === bv) continue
          if (av === null) return o.nullsFirst ? -1 : 1
          if (bv === null) return o.nullsFirst ? 1 : -1
          return (String(av) < String(bv) ? -1 : 1) * (o.asc ? 1 : -1)
        }
        return 0
      })
    }
    const count = out.length
    if (this.max !== null) out = out.slice(0, this.max)
    return { data: this.head ? null : out, error: null, count: this.countMode ? count : null }
  }

  async maybeSingle(): Promise<Result> {
    const r = this.run()
    return { data: (r.data as Row[])[0] ?? null, error: r.error }
  }
  async single(): Promise<Result> {
    const r = this.run()
    const rows = r.data as Row[]
    return rows.length === 1 ? { data: rows[0], error: null } : { data: null, error: { code: 'PGRST116', message: 'not single' } }
  }
  then<A = Result, B = never>(ok?: ((v: Result) => A | PromiseLike<A>) | null, fail?: ((e: unknown) => B | PromiseLike<B>) | null): PromiseLike<A | B> {
    let value: Result
    try {
      value = this.run()
    } catch (e) {
      return Promise.reject(e).then(ok, fail)
    }
    if (this.op !== 'select' && !this.returning) value = { ...value, data: null }
    return Promise.resolve(value).then(ok, fail)
  }
}

export function createFakeDb(tables: Record<string, Row[]>): FakeDb {
  const fake: FakeDb = {
    tables,
    writes: [],
    failTables: new Set(),
    client: { from: (table: string) => new Query(fake, table) },
  }
  return fake
}
