'use client'

// WORLDCUP 2026 (temporary feature) — delete this folder after the tournament.
// Sidebar chip: the team the user locked in. Click → results table popup.

import { useState } from 'react'
import { Trophy, X, Ban, CheckCircle2 } from 'lucide-react'
import { WORLDCUP_TEAMS, TeamFlag } from './teams'
import { getWorldCupResults } from './actions'

// Tournament result: Spain took the cup (final 19 Jul). Picks made on/after
// 20 Jul (Bangkok) — outcome already known — are disqualified from the prize.
const CHAMPION = 'spain'
const DQ_FROM = '2026-07-20'

type Row = { team: string; createdAt: string; name: string }

const bkkDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })

const fmtThai = (iso: string) =>
  new Date(iso).toLocaleDateString('th-TH', {
    timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', year: '2-digit',
  })

function statusOf(r: Row): 'winner' | 'dq' | 'lost' {
  if (r.team !== CHAMPION) return 'lost'
  return bkkDate(r.createdAt) >= DQ_FROM ? 'dq' : 'winner'
}

export default function WorldCupChip({ team }: { team?: string | null }) {
  const def = WORLDCUP_TEAMS.find(t => t.key === team)
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (!def) return null

  const show = async () => {
    setOpen(true)
    if (rows) return
    const res = await getWorldCupResults()
    if ('error' in res && res.error) setError(res.error)
    else setRows((res as { rows: Row[] }).rows)
  }

  const order = { winner: 0, dq: 1, lost: 2 }
  const sorted = rows ? [...rows].sort((a, b) => order[statusOf(a)] - order[statusOf(b)]) : null

  return (
    <>
      <button
        type="button"
        onClick={show}
        className="w-full mb-1 flex items-center gap-2.5 px-3 py-2 rounded-lg bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/20 border border-amber-200/70 dark:border-amber-900/40 hover:border-amber-400 dark:hover:border-amber-700 transition-colors text-left"
      >
        <TeamFlag team={def.key} className="w-8 h-5" />
        <div className="min-w-0 leading-tight">
          <p className="text-[10px] text-amber-600/80 dark:text-amber-400/80 flex items-center gap-1">
            <Trophy className="h-3 w-3" /> แชมป์บอลโลกในใจ
          </p>
          <p className="text-xs font-bold text-zinc-800 dark:text-zinc-100 truncate">{def.th}</p>
        </div>
      </button>

      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)}>
          <div
            className="relative w-full max-w-lg rounded-2xl overflow-hidden bg-white dark:bg-zinc-900 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="relative bg-gradient-to-br from-red-600 via-amber-500 to-yellow-400 px-6 pt-5 pb-6 text-white text-center">
              <button
                onClick={() => setOpen(false)}
                className="absolute top-3 right-3 p-1.5 rounded-full text-white/70 hover:text-white hover:bg-white/20"
                aria-label="close"
              >
                <X className="h-4 w-4" />
              </button>
              <Trophy className="h-10 w-10 mx-auto mb-1 text-yellow-100 drop-shadow" />
              <h2 className="text-lg font-bold flex items-center justify-center gap-2">
                <TeamFlag team="spain" className="w-8 h-5" /> สเปน คือแชมป์โลก 2026!
              </h2>
              <p className="text-xs text-white/85 mt-1">
                ทายตั้งแต่ 20 ก.ค. 69 เป็นต้นไป (หลังรู้ผลบอล) ไม่สามารถรับรางวัลได้
              </p>
            </div>

            <div className="max-h-[60vh] overflow-y-auto p-4">
              {error && <p className="text-xs text-red-600 text-center py-4">{error}</p>}
              {!rows && !error && <p className="text-xs text-zinc-500 text-center py-4">กำลังโหลด...</p>}
              {sorted && (
                <table className="w-full text-xs">
                  <thead className="text-zinc-500 dark:text-zinc-400">
                    <tr className="text-left border-b border-zinc-200 dark:border-zinc-700">
                      <th className="py-1.5 pr-2 font-semibold">#</th>
                      <th className="py-1.5 pr-2 font-semibold">ชื่อ</th>
                      <th className="py-1.5 pr-2 font-semibold">ทีมที่ทาย</th>
                      <th className="py-1.5 pr-2 font-semibold">วันที่ทาย</th>
                      <th className="py-1.5 font-semibold">ผล</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {sorted.map((r, i) => {
                      const st = statusOf(r)
                      return (
                        <tr
                          key={i}
                          className={
                            st === 'winner'
                              ? 'bg-amber-50/60 dark:bg-amber-950/20'
                              : st === 'dq'
                                ? 'line-through decoration-red-500 decoration-2 bg-red-50/40 dark:bg-red-950/10'
                                : ''
                          }
                        >
                          <td className="py-1.5 pr-2 text-zinc-400 font-mono">{i + 1}</td>
                          <td className="py-1.5 pr-2 font-medium text-zinc-800 dark:text-zinc-100">{r.name}</td>
                          <td className="py-1.5 pr-2">
                            <span className="inline-flex items-center gap-1.5">
                              <TeamFlag team={r.team} className="w-5 h-3.5" />
                              <span className={st === 'dq' ? 'line-through decoration-red-500 decoration-2' : ''}>
                                {WORLDCUP_TEAMS.find(t => t.key === r.team)?.th ?? r.team}
                              </span>
                            </span>
                          </td>
                          <td className="py-1.5 pr-2 text-zinc-500">{fmtThai(r.createdAt)}</td>
                          <td className="py-1.5">
                            {st === 'winner' ? (
                              <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-bold">
                                <CheckCircle2 className="h-3.5 w-3.5" /> ได้รางวัล 🏆
                              </span>
                            ) : st === 'dq' ? (
                              <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 font-semibold">
                                <Ban className="h-3.5 w-3.5" /> ทายถูกแต่หมดสิทธิ์
                              </span>
                            ) : (
                              <span className="text-zinc-400">ทายผิด</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
              {sorted && sorted.length === 0 && (
                <p className="text-xs text-zinc-500 text-center py-4">ยังไม่มีใครทายเลย</p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
