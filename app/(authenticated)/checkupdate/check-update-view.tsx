'use client'

import { useState, useTransition, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  CheckCircle2, AlertCircle, RefreshCw, Database, GitBranch,
  ChevronDown, ChevronRight, FileText, Server, Sparkles,
} from 'lucide-react'
import type { SchemaSummary } from '@/lib/schema-introspect'

interface FingerprintResponse {
  fingerprint: string
  counts?: Record<string, number>
  checked_at: string
}
interface ManifestResponse {
  count: number
  manifest_checksum: string
  items: { filename: string; checksum: string; size: number }[]
  checked_at: string
}

export default function CheckUpdateView({
  masterApiUrl,
  localSchema,
  localFingerprint,
  localError,
  masterFingerprint,
  masterManifest,
  masterError,
}: {
  masterApiUrl: string
  localSchema: SchemaSummary | null
  localFingerprint: string
  localError: string | null
  masterFingerprint: FingerprintResponse | null
  masterManifest: ManifestResponse | null
  masterError: string | null
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [showDetails, setShowDetails] = useState(false)
  const [showManifest, setShowManifest] = useState(false)

  // Sync status — green when fingerprints match, amber when differ.
  const inSync = !!localFingerprint && !!masterFingerprint?.fingerprint
    && localFingerprint === masterFingerprint.fingerprint
  const haveBoth = !!localSchema && !!masterFingerprint

  // Local table set for diff display.
  const localTables = useMemo(() => {
    if (!localSchema) return new Map<string, number>()
    const m = new Map<string, number>()
    localSchema.columns.forEach(c => m.set(c.table, (m.get(c.table) ?? 0) + 1))
    return m
  }, [localSchema])

  function refresh() {
    startTransition(() => router.refresh())
  }

  return (
    <div className="max-w-4xl mx-auto space-y-5 pb-16">
      {/* ══════════════ HEADER ══════════════ */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-zinc-900 dark:text-zinc-100 tracking-tight flex items-center gap-2">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-indigo-500 text-white shadow-md shadow-sky-500/20">
              <GitBranch className="h-5 w-5" />
            </span>
            Schema Sync Check
          </h1>
          <p className="text-xs md:text-sm text-zinc-500 dark:text-zinc-400 mt-1.5">
            เช็คว่า schema ของ instance นี้ตรงกับ master หรือไม่ — diff ระดับ table / column / index / trigger / function
          </p>
        </div>
        <button
          onClick={refresh}
          disabled={pending}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-xs font-semibold hover:bg-zinc-800 dark:hover:bg-zinc-100 shadow-sm hover:shadow-md transition-all disabled:opacity-50 active:scale-95"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${pending ? 'animate-spin' : ''}`} />
          ตรวจอีกครั้ง
        </button>
      </div>

      {/* ══════════════ STATUS BANNER ══════════════ */}
      {!haveBoth ? (
        <div className="rounded-2xl border-2 border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/40 p-5">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-zinc-400 shrink-0 mt-0.5" />
            <div className="flex-1 space-y-1.5">
              <p className="text-sm font-bold text-zinc-700 dark:text-zinc-300">ยังเช็คไม่ได้</p>
              {localError && <p className="text-xs text-red-600 dark:text-red-400">Local: {localError}</p>}
              {masterError && <p className="text-xs text-red-600 dark:text-red-400">Master: {masterError}</p>}
              {!masterApiUrl && (
                <p className="text-xs text-zinc-500 mt-1">
                  ตั้ง <code className="px-1 py-0.5 rounded bg-zinc-200 dark:bg-zinc-800 font-mono text-[11px]">MASTER_API_URL</code> ใน
                  {' '}<code className="px-1 py-0.5 rounded bg-zinc-200 dark:bg-zinc-800 font-mono text-[11px]">.env.local</code> แล้ว restart server
                </p>
              )}
            </div>
          </div>
        </div>
      ) : inSync ? (
        <div className="rounded-2xl border-2 border-emerald-200 dark:border-emerald-900/50 bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-950/20 dark:to-zinc-900 p-5">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="h-6 w-6 text-emerald-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-base font-bold text-emerald-700 dark:text-emerald-300">In sync</p>
              <p className="text-sm text-emerald-600 dark:text-emerald-400 mt-0.5">
                Schema ของ instance นี้ตรงกับ master ทุกอย่าง
              </p>
              <p className="text-[11px] font-mono text-zinc-500 mt-1.5">
                fingerprint: {localFingerprint.slice(0, 12)}…
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border-2 border-amber-200 dark:border-amber-900/50 bg-gradient-to-br from-amber-50 to-white dark:from-amber-950/20 dark:to-zinc-900 p-5">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-6 w-6 text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-base font-bold text-amber-700 dark:text-amber-300">Out of sync</p>
              <p className="text-sm text-amber-600 dark:text-amber-400 mt-0.5">
                Schema ต่างกัน — ดูรายละเอียดด้านล่าง แล้ว apply migrations ที่ขาด
              </p>
              <div className="grid grid-cols-2 gap-3 mt-3">
                <div className="rounded-lg bg-white/70 dark:bg-zinc-900/60 border border-amber-200/60 dark:border-amber-900/40 px-3 py-2">
                  <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">This instance</p>
                  <p className="text-[11px] font-mono text-zinc-700 dark:text-zinc-300 mt-0.5">{localFingerprint.slice(0, 12)}…</p>
                </div>
                <div className="rounded-lg bg-white/70 dark:bg-zinc-900/60 border border-amber-200/60 dark:border-amber-900/40 px-3 py-2">
                  <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Master</p>
                  <p className="text-[11px] font-mono text-zinc-700 dark:text-zinc-300 mt-0.5">{masterFingerprint?.fingerprint.slice(0, 12)}…</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════ ENDPOINTS METADATA ══════════════ */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <InfoCard
          icon={<Database className="h-4 w-4 text-sky-500" />}
          title="This instance"
          rows={[
            { k: 'fingerprint', v: localFingerprint ? localFingerprint.slice(0, 16) + '…' : '—' },
            { k: 'tables', v: localTables.size.toString() },
            { k: 'columns', v: (localSchema?.columns.length ?? 0).toString() },
            { k: 'indexes', v: (localSchema?.indexes.length ?? 0).toString() },
            { k: 'triggers', v: (localSchema?.triggers.length ?? 0).toString() },
            { k: 'functions', v: (localSchema?.functions.length ?? 0).toString() },
          ]}
        />
        <InfoCard
          icon={<Server className="h-4 w-4 text-indigo-500" />}
          title="Master"
          subtitle={masterApiUrl}
          rows={[
            { k: 'fingerprint', v: masterFingerprint ? masterFingerprint.fingerprint.slice(0, 16) + '…' : '—' },
            { k: 'tables', v: masterFingerprint?.counts?.tables?.toString() ?? '—' },
            { k: 'columns', v: masterFingerprint?.counts?.columns?.toString() ?? '—' },
            { k: 'indexes', v: masterFingerprint?.counts?.indexes?.toString() ?? '—' },
            { k: 'triggers', v: masterFingerprint?.counts?.triggers?.toString() ?? '—' },
            { k: 'functions', v: masterFingerprint?.counts?.functions?.toString() ?? '—' },
            { k: 'migrations', v: masterManifest?.count.toString() ?? '—' },
          ]}
        />
      </div>

      {/* ══════════════ MIGRATIONS MANIFEST ══════════════ */}
      {masterManifest && (
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
          <button
            onClick={() => setShowManifest(s => !s)}
            className="w-full flex items-center justify-between gap-3 px-5 py-3.5 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
          >
            <div className="flex items-center gap-2.5">
              <FileText className="h-4 w-4 text-zinc-400" />
              <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                Master migration manifest
                <span className="ml-2 text-[11px] font-normal text-zinc-400">
                  {masterManifest.count} files
                </span>
              </p>
            </div>
            {showManifest ? <ChevronDown className="h-4 w-4 text-zinc-400" /> : <ChevronRight className="h-4 w-4 text-zinc-400" />}
          </button>
          {showManifest && (
            <div className="border-t border-zinc-100 dark:border-zinc-800 max-h-[420px] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-zinc-50 dark:bg-zinc-900/95 backdrop-blur">
                  <tr className="text-[10px] uppercase tracking-wider text-zinc-400">
                    <th className="px-4 py-2 text-left">filename</th>
                    <th className="px-4 py-2 text-left">checksum</th>
                    <th className="px-4 py-2 text-right">size</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {masterManifest.items.map(it => (
                    <tr key={it.filename}>
                      <td className="px-4 py-1.5 font-mono text-zinc-700 dark:text-zinc-300">{it.filename}</td>
                      <td className="px-4 py-1.5 font-mono text-zinc-400">{it.checksum.slice(0, 10)}…</td>
                      <td className="px-4 py-1.5 text-right font-mono text-zinc-500 tabular-nums">{it.size}b</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ══════════════ DETAILED DIFF (only when out of sync) ══════════════ */}
      {haveBoth && !inSync && localSchema && (
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
          <button
            onClick={() => setShowDetails(s => !s)}
            className="w-full flex items-center justify-between gap-3 px-5 py-3.5 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
          >
            <div className="flex items-center gap-2.5">
              <Sparkles className="h-4 w-4 text-amber-500" />
              <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                Local schema details
                <span className="ml-2 text-[11px] font-normal text-zinc-400">
                  fetch /api/schema/full from master to compare line-by-line
                </span>
              </p>
            </div>
            {showDetails ? <ChevronDown className="h-4 w-4 text-zinc-400" /> : <ChevronRight className="h-4 w-4 text-zinc-400" />}
          </button>
          {showDetails && (
            <div className="border-t border-zinc-100 dark:border-zinc-800 px-5 py-4 space-y-4">
              <Section title="Tables" items={[...localTables.keys()].sort().map(t => `${t} (${localTables.get(t)} cols)`)} />
              <Section title="Indexes" items={localSchema.indexes.map(i => `${i.table}.${i.name}`)} />
              <Section title="Triggers" items={localSchema.triggers.map(t => `${t.table}.${t.name}`)} />
              <Section title="Functions" items={localSchema.functions.map(f => f.name)} />
              <p className="text-[11px] text-zinc-400 italic pt-2 border-t border-zinc-100 dark:border-zinc-800">
                Phase 1 แสดงแค่ snapshot ของ instance · Phase 2 จะเพิ่ม side-by-side diff + ปุ่ม &quot;Apply pending migrations&quot;
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Sub-components ──────────────────────────────────────────

function InfoCard({
  icon, title, subtitle, rows,
}: {
  icon: React.ReactNode
  title: string
  subtitle?: string
  rows: { k: string; v: string }[]
}) {
  return (
    <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 space-y-2">
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{title}</p>
      </div>
      {subtitle && (
        <p className="text-[11px] font-mono text-zinc-500 truncate -mt-1">{subtitle || '—'}</p>
      )}
      <div className="space-y-1 pt-1">
        {rows.map(r => (
          <div key={r.k} className="flex items-center justify-between text-xs">
            <span className="text-zinc-500 dark:text-zinc-400">{r.k}</span>
            <span className="font-mono font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">{r.v}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function Section({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
        {title} <span className="font-mono">({items.length})</span>
      </p>
      <div className="flex flex-wrap gap-1">
        {items.length === 0 ? (
          <span className="text-[11px] text-zinc-400 italic">none</span>
        ) : items.map((it, i) => (
          <span key={i} className="inline-flex items-center px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-[10px] font-mono text-zinc-600 dark:text-zinc-400">
            {it}
          </span>
        ))}
      </div>
    </div>
  )
}
