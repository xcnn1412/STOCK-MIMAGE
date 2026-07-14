// WORLDCUP 2026 (temporary feature) — delete this folder after the tournament.
// Sidebar reminder chip: the team the user locked in.

import { Trophy } from 'lucide-react'
import { WORLDCUP_TEAMS, TeamFlag } from './teams'

export default function WorldCupChip({ team }: { team?: string | null }) {
  const def = WORLDCUP_TEAMS.find(t => t.key === team)
  if (!def) return null
  return (
    <div className="mb-1 flex items-center gap-2.5 px-3 py-2 rounded-lg bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/20 border border-amber-200/70 dark:border-amber-900/40">
      <TeamFlag team={def.key} className="w-8 h-5" />
      <div className="min-w-0 leading-tight">
        <p className="text-[10px] text-amber-600/80 dark:text-amber-400/80 flex items-center gap-1">
          <Trophy className="h-3 w-3" /> แชมป์บอลโลกในใจ
        </p>
        <p className="text-xs font-bold text-zinc-800 dark:text-zinc-100 truncate">{def.th}</p>
      </div>
    </div>
  )
}
