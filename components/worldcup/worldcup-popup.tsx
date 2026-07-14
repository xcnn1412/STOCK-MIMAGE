'use client'

// WORLDCUP 2026 (temporary feature) — delete this folder after the tournament.
// Popup shown on entry until the user locks in a champion pick. Dismissing
// (X) hides it for the browser session only; picking hides it forever.

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trophy, X, Lock, PartyPopper } from 'lucide-react'
import { WORLDCUP_TEAMS, WORLDCUP_ENDS_MS, TeamFlag } from './teams'
import { saveWorldCupPick } from './actions'

const DISMISS_KEY = 'wc26_popup_dismissed'

export default function WorldCupPopup({ hasPicked }: { hasPicked: boolean }) {
  const router = useRouter()
  const [visible, setVisible] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [savedTeam, setSavedTeam] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // sessionStorage is browser-only — decide visibility after mount
  useEffect(() => {
    if (hasPicked || Date.now() > WORLDCUP_ENDS_MS) return
    if (sessionStorage.getItem(DISMISS_KEY)) return
    setVisible(true)
  }, [hasPicked])

  if (!visible) return null

  const dismiss = () => {
    sessionStorage.setItem(DISMISS_KEY, '1')
    setVisible(false)
  }

  const confirm = async () => {
    if (!selected || saving) return
    setSaving(true)
    setError(null)
    const res = await saveWorldCupPick(selected)
    if (res.error) {
      setError(res.error)
      setSaving(false)
      return
    }
    setSavedTeam(selected)
    setSaving(false)
    router.refresh() // sidebar chip picks up the new pick
  }

  const savedDef = WORLDCUP_TEAMS.find(t => t.key === savedTeam)

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <style>{`
        @keyframes wc26-float {
          0% { transform: translateY(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(-90px) rotate(25deg); opacity: 0; }
        }
        @keyframes wc26-pop {
          0% { transform: scale(0.85); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }
        .wc26-card { animation: wc26-pop 0.25s ease-out; }
        .wc26-confetti span {
          position: absolute;
          bottom: 20%;
          animation: wc26-float 1.6s ease-out infinite;
        }
      `}</style>

      <div className="wc26-card relative w-full max-w-md rounded-2xl overflow-hidden bg-white dark:bg-zinc-900 shadow-2xl">
        {/* Header */}
        <div className="relative bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 px-6 pt-6 pb-8 text-white text-center overflow-hidden">
          <div className="absolute -top-8 -left-8 h-28 w-28 rounded-full bg-white/10" />
          <div className="absolute -bottom-10 -right-6 h-32 w-32 rounded-full bg-white/10" />
          <button
            onClick={dismiss}
            className="absolute top-3 right-3 p-1.5 rounded-full text-white/70 hover:text-white hover:bg-white/20 transition-colors"
            aria-label="close"
          >
            <X className="h-4 w-4" />
          </button>
          <Trophy className="h-12 w-12 mx-auto mb-2 text-amber-300 drop-shadow animate-bounce" />
          <h2 className="text-xl font-bold">ทายแชมป์บอลโลก 2026!</h2>
          <p className="text-sm text-white/85 mt-1">4 ทีมสุดท้ายแล้ว ⚽ ทีมไหนจะได้ชูถ้วย?</p>
        </div>

        {savedTeam ? (
          /* ── Celebration state ── */
          <div className="relative px-6 py-8 text-center">
            <div className="wc26-confetti pointer-events-none absolute inset-0 overflow-hidden text-xl">
              <span style={{ left: '12%', animationDelay: '0s' }}>🎉</span>
              <span style={{ left: '32%', animationDelay: '0.4s' }}>⚽</span>
              <span style={{ left: '55%', animationDelay: '0.2s' }}>🏆</span>
              <span style={{ left: '76%', animationDelay: '0.6s' }}>✨</span>
            </div>
            <div className="flex items-center justify-center gap-3 mb-3">
              <TeamFlag team={savedTeam} className="w-14 h-9" />
              <p className="text-2xl font-bold text-zinc-800 dark:text-zinc-100">{savedDef?.th}</p>
            </div>
            <p className="flex items-center justify-center gap-1.5 text-sm text-zinc-600 dark:text-zinc-300">
              <PartyPopper className="h-4 w-4 text-amber-500" />
              บันทึกแล้ว! เชียร์ให้สุดใจ — ทีมของคุณจะโชว์ใน sidebar
            </p>
            <button
              onClick={() => setVisible(false)}
              className="mt-5 px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-fuchsia-600 hover:opacity-90 text-white rounded-xl text-sm font-semibold transition-opacity"
            >
              ลุยกันเลย! 🚀
            </button>
          </div>
        ) : (
          /* ── Pick state ── */
          <div className="px-5 py-5 space-y-4">
            <div className="grid grid-cols-2 gap-2.5">
              {WORLDCUP_TEAMS.map(t => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setSelected(t.key)}
                  className={`group relative flex items-center gap-2.5 p-3 rounded-xl border-2 transition-all duration-150 hover:scale-[1.03] active:scale-95
                    ${selected === t.key
                      ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/30 shadow-md'
                      : 'border-zinc-200 dark:border-zinc-700 hover:border-indigo-300 dark:hover:border-indigo-700'}`}
                >
                  <TeamFlag team={t.key} className="w-9 h-6" />
                  <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">{t.th}</span>
                  {selected === t.key && (
                    <Trophy className="absolute top-1.5 right-1.5 h-3.5 w-3.5 text-amber-500" />
                  )}
                </button>
              ))}
            </div>

            <p className="flex items-center justify-center gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
              <Lock className="h-3 w-3" />
              เลือกได้ครั้งเดียวเท่านั้น — เปลี่ยนใจทีหลังไม่ได้นะ!
            </p>

            {error && (
              <p className="text-xs text-red-600 dark:text-red-400 text-center">{error}</p>
            )}

            <button
              onClick={confirm}
              disabled={!selected || saving}
              className="w-full py-3 bg-gradient-to-r from-indigo-600 to-fuchsia-600 hover:opacity-90 disabled:opacity-40 text-white rounded-xl text-sm font-bold transition-opacity"
            >
              {saving
                ? 'กำลังบันทึก...'
                : selected
                  ? `ยืนยัน — เชียร์${WORLDCUP_TEAMS.find(t => t.key === selected)?.th}! 🏆`
                  : 'เลือกทีมในใจก่อนเลย ⚽'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
