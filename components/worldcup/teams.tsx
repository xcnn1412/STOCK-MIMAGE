// WORLDCUP 2026 (temporary feature) — delete this folder after the tournament.
// Semifinalists: France, Spain, England, Argentina. Final: 2026-07-19.

export const WORLDCUP_TEAMS = [
  { key: 'france', th: 'ฝรั่งเศส', en: 'France', gradient: 'from-blue-600 to-indigo-700' },
  { key: 'spain', th: 'สเปน', en: 'Spain', gradient: 'from-red-600 to-amber-500' },
  { key: 'england', th: 'อังกฤษ', en: 'England', gradient: 'from-rose-600 to-red-700' },
  { key: 'argentina', th: 'อาร์เจนตินา', en: 'Argentina', gradient: 'from-sky-400 to-sky-600' },
] as const

export type WorldCupTeamKey = (typeof WORLDCUP_TEAMS)[number]['key']

// Popup stops appearing after the final (Bangkok time, one day of slack).
export const WORLDCUP_ENDS_MS = Date.parse('2026-07-21T00:00:00+07:00')

// Inline SVG flags — emoji flags don't render on Windows, so tiny SVGs it is.
export function TeamFlag({ team, className = 'w-10 h-7' }: { team: string; className?: string }) {
  const common = `${className} rounded shadow-sm ring-1 ring-black/10 shrink-0`
  switch (team) {
    case 'france':
      return (
        <svg viewBox="0 0 3 2" className={common} aria-label="France">
          <rect width="1" height="2" fill="#0055A4" />
          <rect x="1" width="1" height="2" fill="#fff" />
          <rect x="2" width="1" height="2" fill="#EF4135" />
        </svg>
      )
    case 'spain':
      return (
        <svg viewBox="0 0 3 2" className={common} aria-label="Spain">
          <rect width="3" height="2" fill="#AA151B" />
          <rect y="0.5" width="3" height="1" fill="#F1BF00" />
        </svg>
      )
    case 'england':
      return (
        <svg viewBox="0 0 3 2" className={common} aria-label="England">
          <rect width="3" height="2" fill="#fff" />
          <rect x="1.3" width="0.4" height="2" fill="#CE1124" />
          <rect y="0.8" width="3" height="0.4" fill="#CE1124" />
        </svg>
      )
    case 'argentina':
      return (
        <svg viewBox="0 0 3 2" className={common} aria-label="Argentina">
          <rect width="3" height="2" fill="#74ACDF" />
          <rect y="0.667" width="3" height="0.667" fill="#fff" />
          <circle cx="1.5" cy="1" r="0.22" fill="#F6B40E" />
        </svg>
      )
    default:
      return null
  }
}
