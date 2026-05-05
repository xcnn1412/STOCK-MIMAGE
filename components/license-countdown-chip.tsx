'use client'

import { useEffect, useState } from 'react'
import { ShieldCheck, ShieldAlert, Hourglass } from 'lucide-react'

interface Props {
  /** ISO 8601 expiry from the server. null = license env not configured. */
  expiresAtIso: string | null
}

const HOUR_MS = 3_600_000
const DAY_MS = 86_400_000

/**
 * Live countdown to license expiry. Renders nothing until mounted on the
 * client to avoid hydration mismatch (server's Date.now() ≠ client's). Ticks
 * every second when <1h remaining, every minute otherwise — saves a reflow
 * when there's no second-level urgency.
 */
export default function LicenseCountdownChip({ expiresAtIso }: Props) {
  const [now, setNow] = useState<number | null>(null)

  useEffect(() => {
    if (!expiresAtIso) return
    const target = new Date(expiresAtIso).getTime()
    if (Number.isNaN(target)) return

    setNow(Date.now())
    let timer: ReturnType<typeof setTimeout>
    const tick = () => {
      const current = Date.now()
      setNow(current)
      const diff = target - current
      // Sub-hour or already expired → tick every second so the user sees movement
      const interval = diff > 0 && diff < HOUR_MS ? 1_000 : 60_000
      timer = setTimeout(tick, interval)
    }
    timer = setTimeout(tick, 1_000)
    return () => clearTimeout(timer)
  }, [expiresAtIso])

  if (!expiresAtIso) return null
  const target = new Date(expiresAtIso).getTime()
  if (Number.isNaN(target)) return null
  if (now === null) {
    // Pre-mount placeholder — keeps layout stable, avoids hydration drift
    return (
      <div className="mb-2 rounded-lg border border-zinc-200/70 dark:border-zinc-800/70 px-3 py-2 text-[11px] text-zinc-400">
        License…
      </div>
    )
  }

  const diff = target - now
  const expired = diff <= 0
  const totalSec = Math.floor(Math.abs(diff) / 1000)
  const days = Math.floor(totalSec / 86_400)
  const hours = Math.floor((totalSec % 86_400) / 3_600)
  const minutes = Math.floor((totalSec % 3_600) / 60)
  const seconds = totalSec % 60

  // Color tiers — diff in days, sign-aware
  const daysSigned = Math.ceil(diff / DAY_MS)
  let palette: { wrap: string; label: string; value: string; icon: string; Icon: typeof ShieldCheck }
  if (expired) {
    palette = {
      wrap: 'border-red-300 bg-red-50 dark:border-red-900/60 dark:bg-red-950/30',
      label: 'text-red-700 dark:text-red-300',
      value: 'text-red-900 dark:text-red-100',
      icon: 'text-red-600 dark:text-red-400',
      Icon: ShieldAlert,
    }
  } else if (daysSigned <= 7) {
    palette = {
      wrap: 'border-rose-300 bg-rose-50 dark:border-rose-900/60 dark:bg-rose-950/30',
      label: 'text-rose-700 dark:text-rose-300',
      value: 'text-rose-900 dark:text-rose-100',
      icon: 'text-rose-600 dark:text-rose-400',
      Icon: Hourglass,
    }
  } else if (daysSigned <= 30) {
    palette = {
      wrap: 'border-amber-300 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/30',
      label: 'text-amber-700 dark:text-amber-300',
      value: 'text-amber-900 dark:text-amber-100',
      icon: 'text-amber-600 dark:text-amber-400',
      Icon: Hourglass,
    }
  } else {
    palette = {
      wrap: 'border-emerald-200 bg-emerald-50/70 dark:border-emerald-900/40 dark:bg-emerald-950/20',
      label: 'text-emerald-700 dark:text-emerald-400',
      value: 'text-emerald-900 dark:text-emerald-100',
      icon: 'text-emerald-600 dark:text-emerald-400',
      Icon: ShieldCheck,
    }
  }

  // Display: expired → "หมดอายุแล้ว Xd" — days only ≥ 1d remaining;
  // < 1h shows live HH:MM:SS, < 24h shows Hh Mm
  let display: string
  if (expired) {
    display = days > 0 ? `หมดอายุแล้ว ${days} วัน` : 'หมดอายุแล้ว'
  } else if (days >= 1) {
    display = `${days} วัน ${hours} ชม.`
  } else if (diff >= HOUR_MS) {
    display = `${hours} ชม. ${minutes} นาที`
  } else {
    display = `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
  }

  const fmtDate = new Date(target).toLocaleDateString('th-TH', { dateStyle: 'medium' })

  return (
    <div
      className={`mb-2 rounded-lg border px-3 py-2 ${palette.wrap}`}
      title={`License expires: ${fmtDate}`}
    >
      <div className="flex items-center gap-2">
        <palette.Icon className={`h-3.5 w-3.5 shrink-0 ${palette.icon}`} />
        <span className={`text-[10px] font-bold uppercase tracking-[0.1em] ${palette.label}`}>
          License
        </span>
      </div>
      <div className={`mt-0.5 font-mono text-[13px] font-semibold tabular-nums ${palette.value}`}>
        {display}
      </div>
    </div>
  )
}

function pad(n: number) {
  return n.toString().padStart(2, '0')
}
