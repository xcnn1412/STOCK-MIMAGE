'use client'

// หน้าต่าง "จับชุดเอกสาร" — เลือกการวางหน้า → จับชุดทีละไฟล์ (ไฟล์ละไม่เกิน 20 ใบ) → เปิด PDF / ทำเครื่องหมายเข้าแฟ้ม
// BundlePanel แสดงผลล้วน (ทุกอย่างมาทาง props) — BundleDialog ถือ state, เรียก route และ server action
// ห้าม import lib/claim-bundle.ts, lib/claim-files.ts, lib/claim-voucher.ts ที่นี่ (ลาก pdf-lib/react-pdf มาที่ browser)

import { useEffect, useRef, useState } from 'react'
import { AlertCircle, CheckCircle2, ExternalLink, FileStack, FolderCheck, Loader2, RefreshCw, XCircle } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { BUNDLE_FAIL_REASON_TEXT, BUNDLE_KIND_LABEL, BUNDLE_MAX_CLAIMS_PER_FILE } from '@/lib/claim-bundle-labels'
import type { BundleFailReason, BundleFileKind, BundleLayout, BundleReport } from '@/lib/claim-bundle-labels'
import { bundleUrl, chunkClaims } from './claims-filter'
import { markClaimsFiled } from './actions'

export interface BundleClaimRef { id: string; claim_number: string; title: string; incomplete: boolean; fileCount: number }

export type BundleGroupStatus =
  | { state: 'waiting' }
  | { state: 'working' }
  /** report = null เมื่อหัว X-Bundle-Report หายหรืออ่านไม่ได้ — ยังเปิด PDF ได้ แค่ไม่มีรายละเอียด */
  | { state: 'done'; url: string; report: BundleReport | null }
  | { state: 'failed'; error: string }

export type BundleFiledStatus =
  | { state: 'idle' }
  | { state: 'working' }
  | { state: 'done' }
  | { state: 'failed'; error: string }

export interface BundleGroup { claims: BundleClaimRef[]; status: BundleGroupStatus; filed: BundleFiledStatus }

export type BundleStep = 'options' | 'working' | 'done'

export interface BundlePanelProps {
  step: BundleStep
  /** กลุ่มละไม่เกิน 20 ใบ เรียงตามเลขที่ใบเบิกแล้ว (chunkClaims) */
  groups: BundleGroup[]
  layout: BundleLayout
  duplex: boolean
  isAdmin: boolean
  isEn: boolean
  onLayoutChange: (layout: BundleLayout) => void
  onDuplexChange: (duplex: boolean) => void
  onStart: () => void
  onRetry: (index: number) => void
  onMarkFiled: (index: number) => void
  onClose: () => void
}

const KIND_LABEL_EN: Record<BundleFileKind, string> = {
  receipt: 'Receipt/attachment',
  settlement: 'Settlement receipt',
  tax_invoice: 'Tax invoice',
  refund_slip: 'Refund slip',
}
const FAIL_REASON_EN: Record<BundleFailReason, string> = {
  fetch: 'Could not download the file',
  'foreign-host': 'File is stored outside this system',
  'too-large': 'File is larger than 15MB',
  unsupported: 'Unsupported file type (JPEG, PNG, PDF only)',
  broken: 'File is damaged or password-protected',
}

/** key ของตารางข้อความจริงๆ (ไม่ใช่ 'toString' ที่ติดมากับ prototype) */
const ownKey = (table: object, key: unknown) =>
  typeof key === 'string' && Object.prototype.hasOwnProperty.call(table, key)

/** อ่านหัว X-Bundle-Report แบบไม่เชื่อใจ — หาย/เสีย/รูปร่างผิด = null (ขั้นสรุปยังแสดง PDF ได้) */
export function parseBundleReport(header: string | null | undefined): BundleReport | null {
  if (!header) return null
  try {
    const raw: unknown = JSON.parse(decodeURIComponent(header))
    if (!raw || typeof raw !== 'object') return null
    const { pages, claims, failedTotal } = raw as { pages?: unknown; claims?: unknown; failedTotal?: unknown }
    if (typeof pages !== 'number' || !Number.isFinite(pages) || !Array.isArray(claims)) return null
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
    return {
      pages,
      // route ใส่รายการ failed ในหัวได้จำกัด — failedTotal บอกจำนวนจริง (ถ้ามี)
      ...(typeof failedTotal === 'number' && Number.isFinite(failedTotal) ? { failedTotal } : {}),
      claims: claims
        .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object' && typeof (c as { claimNumber?: unknown }).claimNumber === 'string')
        .map(c => ({
          claimNumber: c.claimNumber as string,
          pages: num(c.pages),
          included: num(c.included),
          // ชนิด/สาเหตุที่ไม่รู้จัก (route รุ่นใหม่กว่าหน้าจอ) ตัดทิ้ง ดีกว่าแสดงข้อความพัง
          failed: (Array.isArray(c.failed) ? c.failed : [])
            .filter((f): f is { kind: BundleFileKind; index: number; reason: BundleFailReason } =>
              !!f && typeof f === 'object'
              && ownKey(BUNDLE_KIND_LABEL, f.kind)
              && ownKey(BUNDLE_FAIL_REASON_TEXT, f.reason)
              && typeof f.index === 'number')
            .map(f => ({ kind: f.kind, index: f.index, reason: f.reason })),
        })),
    }
  } catch {
    return null
  }
}

const btnBase = 'inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
const btnGhost = `${btnBase} text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800`
const btnPrimary = `${btnBase} bg-emerald-600 hover:bg-emerald-700 text-white font-semibold`
const btnOutline = `${btnBase} border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800`

function groupLabel(group: BundleGroup, index: number, total: number, isEn: boolean) {
  const first = group.claims[0]?.claim_number ?? ''
  const last = group.claims[group.claims.length - 1]?.claim_number ?? ''
  const range = group.claims.length > 1 ? `${first} – ${last}` : first
  return {
    head: isEn ? `Set ${index + 1}/${total}` : `ชุดที่ ${index + 1}/${total}`,
    range,
    count: isEn ? `${group.claims.length} claim${group.claims.length === 1 ? '' : 's'}` : `${group.claims.length} ใบ`,
  }
}

/** คำเตือน (ไม่บล็อก): เอกสารยังไม่ครบ + ไม่มีไฟล์แนบเลย */
function BundleNotices({ claims, isEn }: { claims: BundleClaimRef[]; isEn: boolean }) {
  const incomplete = claims.filter(c => c.incomplete)
  const empty = claims.filter(c => c.fileCount === 0)
  if (incomplete.length === 0 && empty.length === 0) return null
  const single = claims.length === 1
  const shown = incomplete.slice(0, 5).map(c => c.claim_number).join(', ')
  const more = incomplete.length - 5
  return (
    <div className="space-y-1.5">
      {incomplete.length > 0 && (
        <p className="flex items-start gap-2 rounded-lg border border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
          <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span className="min-w-0 wrap-break-word">
            {single
              ? (isEn ? 'This claim is missing documents — the set will still be made.' : 'ใบเบิกนี้เอกสารยังไม่ครบ — จับชุดได้ แต่ชุดจะยังขาดเอกสาร')
              : <>
                  {isEn ? `${incomplete.length} claims are missing documents: ` : `เอกสารยังไม่ครบ ${incomplete.length} ใบ: `}
                  <span className="font-mono">{shown}</span>
                  {more > 0 && (isEn ? ` and ${more} more` : ` และอีก ${more} ใบ`)}
                </>}
          </span>
        </p>
      )}
      {empty.length > 0 && (
        <p className="flex items-start gap-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 px-3 py-2 text-xs text-zinc-600 dark:text-zinc-400">
          <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span className="min-w-0 wrap-break-word">
            {single
              ? (isEn ? 'No attachments — the set will contain the claim page only.' : 'ไม่มีไฟล์แนบ — ชุดจะมีเฉพาะหน้าใบเบิก')
              : (isEn ? `${empty.length} claims have no attachments — only their claim page is included.` : `ไม่มีไฟล์แนบเลย ${empty.length} ใบ — ชุดของใบเหล่านี้มีเฉพาะหน้าใบเบิก`)}
          </span>
        </p>
      )}
    </div>
  )
}

function StatusChip({ status, isEn }: { status: BundleGroupStatus; isEn: boolean }) {
  const chip = 'inline-flex items-center gap-1 shrink-0 px-2 py-0.5 rounded-full text-[11px] font-semibold'
  switch (status.state) {
    case 'waiting':
      return <span className={`${chip} bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400`}>{isEn ? 'Waiting' : 'รอคิว'}</span>
    case 'working':
      return (
        <span className={`${chip} bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400`}>
          <Loader2 className="h-3 w-3 animate-spin" />
          {isEn ? 'Working…' : 'กำลังจับชุด…'}
        </span>
      )
    case 'done':
      return (
        <span className={`${chip} bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400`}>
          <CheckCircle2 className="h-3 w-3" />
          {status.report
            ? (isEn ? `${status.report.pages} pages` : `${status.report.pages} หน้า`)
            : (isEn ? 'Ready' : 'พร้อมแล้ว')}
        </span>
      )
    case 'failed':
      return (
        <span className={`${chip} bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400`}>
          <XCircle className="h-3 w-3" />
          {isEn ? 'Failed' : 'ไม่สำเร็จ'}
        </span>
      )
  }
}

function GroupRow({ group, index, total, isAdmin, isEn, onRetry, onMarkFiled }: {
  group: BundleGroup; index: number; total: number; isAdmin: boolean; isEn: boolean
  onRetry: (index: number) => void; onMarkFiled: (index: number) => void
}) {
  const label = groupLabel(group, index, total, isEn)
  const { status, filed } = group
  const idOf = new Map(group.claims.map(c => [c.claim_number, c.id]))
  const failedFiles = status.state === 'done' && status.report
    ? status.report.claims.flatMap(c => c.failed.map(f => ({ ...f, claimNumber: c.claimNumber })))
    : []
  // หัวรายงานถูกตัดรายการได้ — จำนวนจริงมาจาก failedTotal ส่วนที่เหลือดูจากหน้าแจ้งใน PDF
  const failedTotal = Math.max(failedFiles.length, status.state === 'done' ? status.report?.failedTotal ?? 0 : 0)
  const notListed = failedTotal - failedFiles.length

  return (
    <li className="min-w-0 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <p className="min-w-0 text-sm text-zinc-700 dark:text-zinc-300 wrap-break-word">
          <span className="font-semibold text-zinc-900 dark:text-zinc-100">{label.head}</span>
          {' · '}<span className="font-mono text-xs">{label.range}</span>
          {' · '}{label.count}
        </p>
        <StatusChip status={status} isEn={isEn} />
      </div>

      {status.state === 'failed' && (
        <div className="flex flex-wrap items-center gap-2">
          <p className="min-w-0 flex-1 basis-48 text-xs text-red-600 dark:text-red-400 wrap-break-word">{status.error}</p>
          <button type="button" onClick={() => onRetry(index)} className={btnOutline}>
            <RefreshCw className="h-3.5 w-3.5" />
            {isEn ? 'Retry' : 'ลองใหม่'}
          </button>
        </div>
      )}

      {status.state === 'done' && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {/* เปิดด้วยการคลิกของผู้ใช้เองเสมอ — ไม่เปิดอัตโนมัติหลังโหลด (ตัวบล็อกป๊อปอัปจะกัน) */}
            <a href={status.url} target="_blank" rel="noopener" className={btnPrimary}>
              <ExternalLink className="h-3.5 w-3.5" />
              {isEn ? 'Open PDF' : 'เปิด PDF'}
            </a>
            {isAdmin && (filed.state === 'done'
              ? (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                  <FolderCheck className="h-3.5 w-3.5" />
                  {isEn ? 'Marked as filed' : 'ทำเครื่องหมายแล้ว'}
                </span>
              )
              : (
                <button type="button" onClick={() => onMarkFiled(index)} disabled={filed.state === 'working'} className={btnOutline}>
                  {filed.state === 'working' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FolderCheck className="h-3.5 w-3.5" />}
                  {isEn ? `Mark as filed (${group.claims.length})` : `ทำเครื่องหมายว่าเข้าแฟ้มแล้ว (${group.claims.length} ใบ)`}
                </button>
              ))}
          </div>
          {isAdmin && filed.state === 'failed' && (
            <p className="text-xs text-red-600 dark:text-red-400 wrap-break-word">{filed.error}</p>
          )}

          {!status.report ? (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {isEn
                ? 'No details were returned for this set — check the PDF for notice pages of files that could not be included.'
                : 'ไม่ได้รับรายละเอียดของชุดนี้ — ดูหน้าแจ้งไฟล์ที่รวมไม่ได้ใน PDF'}
            </p>
          ) : failedTotal === 0 ? (
            <p className="text-xs text-emerald-700 dark:text-emerald-400">
              {isEn ? 'All attachments were included.' : 'รวมไฟล์แนบได้ครบทุกไฟล์'}
            </p>
          ) : (
            <div className="rounded-lg border border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/30 px-3 py-2">
              <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">
                {isEn
                  ? `${failedTotal} file(s) could not be included — print them separately`
                  : `ไฟล์ที่รวมเข้าชุดไม่ได้ ${failedTotal} ไฟล์ — ต้องพิมพ์แยก`}
              </p>
              <ul className="mt-1 space-y-0.5">
                {failedFiles.map((f, i) => {
                  const id = idOf.get(f.claimNumber)
                  const text = `${isEn ? KIND_LABEL_EN[f.kind] : BUNDLE_KIND_LABEL[f.kind]} ${f.index} · ${isEn ? FAIL_REASON_EN[f.reason] : BUNDLE_FAIL_REASON_TEXT[f.reason]}`
                  return (
                    <li key={`${f.claimNumber}-${f.kind}-${f.index}-${i}`} className="text-xs text-amber-900 dark:text-amber-200 wrap-break-word">
                      {id ? (
                        <a
                          href={`/finance/${id}`}
                          target="_blank"
                          rel="noopener"
                          className="font-mono underline underline-offset-2 hover:text-amber-700 dark:hover:text-amber-100"
                        >
                          {f.claimNumber}
                        </a>
                      ) : (
                        <span className="font-mono">{f.claimNumber}</span>
                      )}
                      {' · '}{text}
                    </li>
                  )
                })}
              </ul>
              {notListed > 0 && (
                <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">
                  {isEn
                    ? `…and ${notListed} more — see the notice pages in the PDF`
                    : `…และอีก ${notListed} ไฟล์ — ดูหน้าแจ้งใน PDF`}
                </p>
              )}
            </div>
          )}
        </>
      )}
    </li>
  )
}

/** เนื้อหาของหน้าต่างจับชุด — แสดงผลล้วน ไม่มี state/effect (ตรวจด้วย renderToStaticMarkup ได้) */
export function BundlePanel({
  step, groups, layout, duplex, isAdmin, isEn,
  onLayoutChange, onDuplexChange, onStart, onRetry, onMarkFiled, onClose,
}: BundlePanelProps) {
  const claims = groups.flatMap(g => g.claims)
  const single = claims.length === 1 ? claims[0] : null

  if (step === 'options') {
    const radioCls = (active: boolean) =>
      `flex items-start gap-2.5 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors ${
        active
          ? 'border-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/30'
          : 'border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
      }`
    return (
      <div className="min-w-0 space-y-4">
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/60 px-3 py-2.5 text-sm">
          {single ? (
            <>
              <p className="font-mono text-xs text-zinc-500">{single.claim_number}</p>
              <p className="font-medium text-zinc-900 dark:text-zinc-100 wrap-break-word">{single.title}</p>
            </>
          ) : (
            <>
              <p className="font-medium text-zinc-900 dark:text-zinc-100">
                {isEn ? `${claims.length} claims` : `ใบเบิก ${claims.length} ใบ`}
              </p>
              <p className="text-xs text-zinc-500 mt-0.5">
                {groups.length > 1
                  ? (isEn
                    ? `Split into ${groups.length} PDF files (up to ${BUNDLE_MAX_CLAIMS_PER_FILE} claims each), in claim-number order`
                    : `แบ่งเป็น ${groups.length} ไฟล์ PDF (ไฟล์ละไม่เกิน ${BUNDLE_MAX_CLAIMS_PER_FILE} ใบ) เรียงตามเลขที่ใบเบิก`)
                  : (isEn ? 'One PDF file, in claim-number order' : 'PDF ไฟล์เดียว เรียงตามเลขที่ใบเบิก')}
              </p>
            </>
          )}
        </div>

        <fieldset className="space-y-2">
          <legend className="mb-2 text-xs font-semibold text-zinc-500">{isEn ? 'Page layout' : 'การวางหน้า'}</legend>
          <label className={radioCls(layout === 'one')}>
            <input
              type="radio"
              name="bundle-layout"
              value="one"
              checked={layout === 'one'}
              onChange={() => onLayoutChange('one')}
              className="mt-0.5 accent-emerald-600"
            />
            <span className="text-sm text-zinc-800 dark:text-zinc-200">{isEn ? 'One file per page (easy to read)' : 'ไฟล์ละ 1 หน้า (อ่านง่าย)'}</span>
          </label>
          <label className={radioCls(layout === 'two')}>
            <input
              type="radio"
              name="bundle-layout"
              value="two"
              checked={layout === 'two'}
              onChange={() => onLayoutChange('two')}
              className="mt-0.5 accent-emerald-600"
            />
            <span className="text-sm text-zinc-800 dark:text-zinc-200">{isEn ? 'Two images per page (saves paper)' : 'รูป 2 รูปต่อหน้า (ประหยัดกระดาษ)'}</span>
          </label>
          <p className="text-[11px] text-zinc-500">
            {isEn ? 'Attached PDF files always take one page each.' : 'ไฟล์ PDF ที่แนบมาวางหน้าละ 1 หน้าเสมอ ไม่ถูกย่อรวมกัน'}
          </p>
        </fieldset>

        {claims.length > 1 && (
          <label className="flex items-start gap-2.5 cursor-pointer text-sm text-zinc-800 dark:text-zinc-200">
            <input
              type="checkbox"
              checked={duplex}
              onChange={e => onDuplexChange(e.target.checked)}
              className="mt-0.5 accent-emerald-600"
            />
            <span className="min-w-0 wrap-break-word">
              {isEn ? 'Double-sided printing — start every claim on a new sheet' : 'พิมพ์สองหน้า — ให้ใบเบิกใหม่เริ่มที่กระดาษแผ่นใหม่'}
            </span>
          </label>
        )}

        <BundleNotices claims={claims} isEn={isEn} />

        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className={btnGhost}>{isEn ? 'Cancel' : 'ยกเลิก'}</button>
          <button type="button" onClick={onStart} disabled={claims.length === 0} className={btnPrimary}>
            <FileStack className="h-4 w-4" />
            {isEn ? 'Bundle documents' : 'จับชุดเอกสาร'}
          </button>
        </div>
      </div>
    )
  }

  const total = groups.length
  const done = groups.filter(g => g.status.state === 'done').length
  const failed = groups.filter(g => g.status.state === 'failed').length
  const current = groups.findIndex(g => g.status.state === 'working')
  const progress = step === 'working'
    ? (current >= 0
      ? (isEn ? `Bundling set ${current + 1} of ${total}… (${done} done)` : `กำลังจับชุดที่ ${current + 1}/${total}… (เสร็จแล้ว ${done} ชุด)`)
      : (isEn ? `Waiting… (${done} of ${total} done)` : `รอคิว… (เสร็จแล้ว ${done}/${total} ชุด)`))
    : (isEn
      ? `Finished ${done} of ${total} set(s)${failed > 0 ? ` · ${failed} failed` : ''}`
      : `จับชุดเสร็จ ${done}/${total} ชุด${failed > 0 ? ` · ไม่สำเร็จ ${failed} ชุด` : ''}`)

  return (
    <div className="min-w-0 space-y-3">
      <p aria-live="polite" role="status" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
        {progress}
      </p>
      <ul className="space-y-2">
        {groups.map((group, i) => (
          <GroupRow
            key={group.claims[0]?.id ?? i}
            group={group}
            index={i}
            total={total}
            isAdmin={isAdmin}
            isEn={isEn}
            onRetry={onRetry}
            onMarkFiled={onMarkFiled}
          />
        ))}
      </ul>
      {step === 'done' && <BundleNotices claims={claims} isEn={isEn} />}
      <div className="flex flex-wrap justify-end gap-2 pt-1">
        <button type="button" onClick={onClose} className={step === 'done' ? btnOutline : btnGhost}>
          {step === 'done' ? (isEn ? 'Close' : 'ปิด') : (isEn ? 'Cancel' : 'ยกเลิก')}
        </button>
      </div>
    </div>
  )
}

// ── ตัวถือ state ────────────────────────────────────────────────────────────

const OPTIONS_KEY = 'finance:bundle-options'
type BundleOptions = { layout: BundleLayout; duplex: boolean }

/** ตัวเลือกล่าสุดของเบราว์เซอร์นี้ — storage ปิด/ค่าเสีย = ค่าเริ่มต้น */
function readSavedOptions(): BundleOptions {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(OPTIONS_KEY) || 'null')
    const o = (saved && typeof saved === 'object' ? saved : {}) as { layout?: unknown; duplex?: unknown }
    return { layout: o.layout === 'two' ? 'two' : 'one', duplex: o.duplex === true }
  } catch {
    return { layout: 'one', duplex: false }
  }
}

function saveOptions(options: BundleOptions) {
  try { localStorage.setItem(OPTIONS_KEY, JSON.stringify(options)) } catch { /* ปิด storage — ครั้งหน้าใช้ค่าเริ่มต้น */ }
}

/** ขอ PDF หนึ่งชุด — ไม่ throw: ทุกความผิดพลาดกลายเป็นสถานะ failed พร้อมข้อความ */
async function fetchGroup(ids: string[], options: BundleOptions, signal: AbortSignal | undefined, isEn: boolean): Promise<BundleGroupStatus> {
  let res: Response
  try {
    res = await fetch(bundleUrl(ids, options), { signal, cache: 'no-store' })
  } catch {
    return { state: 'failed', error: isEn ? 'Could not reach the server — check the connection and retry.' : 'ติดต่อเซิร์ฟเวอร์ไม่ได้ — ตรวจการเชื่อมต่อแล้วลองใหม่' }
  }
  const generic = isEn ? `Bundling failed (code ${res.status}) — please retry.` : `จับชุดเอกสารไม่สำเร็จ (รหัส ${res.status}) — ลองใหม่อีกครั้ง`
  if (!res.ok) {
    let message = ''
    try {
      const body: unknown = await res.json()
      const error = body && typeof body === 'object' ? (body as { error?: unknown }).error : undefined
      if (typeof error === 'string') message = error.trim()
    } catch { /* ไม่ใช่ JSON (เช่นหน้า error ของ proxy) — ใช้ข้อความทั่วไป */ }
    return { state: 'failed', error: message || generic }
  }
  // 200 ที่ไม่ใช่ PDF (หน้า HTML ที่หลงมา) เปิดไปก็พัง — ถือว่าล้ม
  if (!(res.headers.get('content-type') || '').includes('application/pdf')) return { state: 'failed', error: generic }
  try {
    const blob = await res.blob()
    const report = parseBundleReport(res.headers.get('X-Bundle-Report'))
    return { state: 'done', url: URL.createObjectURL(blob), report }
  } catch {
    return { state: 'failed', error: generic }
  }
}

export interface BundleDialogProps {
  claims: BundleClaimRef[]
  isAdmin: boolean
  isEn: boolean
  onClose: () => void
  /** เรียกหลังทำเครื่องหมายเข้าแฟ้มสำเร็จ (ให้หน้าที่เปิดโหลดข้อมูลใหม่) */
  onFiled?: () => void
}

/** หน้าต่างจับชุดเอกสาร — parent mount เฉพาะตอนเปิด ({open && <BundleDialog … />}) */
export default function BundleDialog({ claims, isAdmin, isEn, onClose, onFiled }: BundleDialogProps) {
  const [options, setOptions] = useState<BundleOptions>(readSavedOptions)
  // แบ่งกลุ่มครั้งเดียวตอนเปิด — parent render ใหม่ระหว่างทำงาน กลุ่มต้องไม่เลื่อน
  const [chunks] = useState(() => chunkClaims(claims))
  const [statuses, setStatuses] = useState<BundleGroupStatus[]>(() => chunks.map(() => ({ state: 'waiting' })))
  const [filed, setFiled] = useState<BundleFiledStatus[]>(() => chunks.map(() => ({ state: 'idle' })))
  const [started, setStarted] = useState(false)

  const urls = useRef<string[]>([])
  const queue = useRef<number[]>([])
  const running = useRef(false)
  const alive = useRef(true)
  const controller = useRef<AbortController | null>(null)
  const runOptions = useRef<BundleOptions>(options)

  // ปิดหน้าต่าง = ยกเลิกคำขอที่ค้าง และคืนหน่วยความจำของ PDF ทุกไฟล์
  useEffect(() => {
    alive.current = true
    controller.current = new AbortController()
    const created = urls.current
    return () => {
      alive.current = false
      controller.current?.abort()
      for (const url of created) URL.revokeObjectURL(url)
      created.length = 0
    }
  }, [])

  const setStatus = (index: number, status: BundleGroupStatus) =>
    setStatuses(list => list.map((s, i) => (i === index ? status : s)))
  const setFiledStatus = (index: number, status: BundleFiledStatus) =>
    setFiled(list => list.map((s, i) => (i === index ? status : s)))

  // ทำทีละชุดตามคิว — ชุดใหญ่ใช้เวลาหลายวินาที ขอพร้อมกันจะกดเซิร์ฟเวอร์และหน่วยความจำ
  const pump = async () => {
    if (running.current) return
    running.current = true
    try {
      while (queue.current.length > 0 && alive.current) {
        const index = queue.current.shift() as number
        setStatus(index, { state: 'working' })
        const result = await fetchGroup(chunks[index].map(c => c.id), runOptions.current, controller.current?.signal, isEn)
        if (!alive.current) {
          if (result.state === 'done') URL.revokeObjectURL(result.url)
          return
        }
        if (result.state === 'done') urls.current.push(result.url)
        setStatus(index, result)
      }
    } finally {
      running.current = false
    }
  }

  const start = () => {
    saveOptions(options)
    // ใบเดียวไม่มีอะไรให้คั่น — ไม่ส่ง duplex
    runOptions.current = { layout: options.layout, duplex: claims.length > 1 && options.duplex }
    queue.current = chunks.map((_, i) => i)
    setStarted(true)
    void pump()
  }

  const retry = (index: number) => {
    setStatus(index, { state: 'waiting' })
    queue.current.push(index)
    void pump()
  }

  const markFiled = async (index: number) => {
    setFiledStatus(index, { state: 'working' })
    let result: { success?: true; error?: string }
    try {
      result = await markClaimsFiled(chunks[index].map(c => c.id))
    } catch {
      result = { error: isEn ? 'Could not save — please retry.' : 'บันทึกไม่สำเร็จ — ลองใหม่อีกครั้ง' }
    }
    if (!alive.current) return
    if (result.error) {
      setFiledStatus(index, { state: 'failed', error: result.error })
    } else {
      setFiledStatus(index, { state: 'done' })
      onFiled?.()
    }
  }

  const step: BundleStep = !started
    ? 'options'
    : statuses.some(s => s.state === 'waiting' || s.state === 'working') ? 'working' : 'done'
  const groups: BundleGroup[] = chunks.map((group, i) => ({ claims: group, status: statuses[i], filed: filed[i] }))

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto overflow-x-hidden sm:max-w-lg"
        // กำลังจับชุดอยู่ — คลิกพลาดนอกหน้าต่างต้องไม่ยกเลิกงาน (ปิดได้ด้วยปุ่มยกเลิก/กากบาท)
        onInteractOutside={e => { if (step === 'working') e.preventDefault() }}
      >
        <DialogHeader className="min-w-0">
          <DialogTitle className="flex items-center gap-2 pr-6">
            <FileStack className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>{isEn ? 'Bundle documents' : 'จับชุดเอกสาร'}</span>
          </DialogTitle>
          <DialogDescription>
            {isEn
              ? 'Combine the claim page and its attachments into one PDF ready to print for filing.'
              : 'รวมหน้าใบเบิกกับไฟล์แนบเป็น PDF ไฟล์เดียว พร้อมพิมพ์เข้าแฟ้ม'}
          </DialogDescription>
        </DialogHeader>
        <BundlePanel
          step={step}
          groups={groups}
          layout={options.layout}
          duplex={options.duplex}
          isAdmin={isAdmin}
          isEn={isEn}
          onLayoutChange={layout => setOptions(o => ({ ...o, layout }))}
          onDuplexChange={duplex => setOptions(o => ({ ...o, duplex }))}
          onStart={start}
          onRetry={retry}
          onMarkFiled={markFiled}
          onClose={onClose}
        />
      </DialogContent>
    </Dialog>
  )
}
