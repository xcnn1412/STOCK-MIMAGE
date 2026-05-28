// Shared config for job_cost_events.phase
// Keep in sync with the CHECK constraint in supabase/migrations/20260528_add_job_cost_events_phase.sql

export type EventPhase = 'setup' | 'main' | 'teardown' | 'delivery' | 'other'

export const EVENT_PHASES: ReadonlyArray<{
  value: EventPhase
  labelTh: string
  labelEn: string
  color: string
  icon: string
}> = [
  { value: 'setup',    labelTh: 'เซ็ตอัพ',     labelEn: 'Setup',    color: 'sky',     icon: '🔧' },
  { value: 'main',     labelTh: 'วันงาน',      labelEn: 'Main',     color: 'emerald', icon: '⭐' },
  { value: 'teardown', labelTh: 'รื้อถอน',     labelEn: 'Teardown', color: 'orange',  icon: '📦' },
  { value: 'delivery', labelTh: 'จัดส่งเพิ่ม', labelEn: 'Delivery', color: 'violet',  icon: '🚚' },
  { value: 'other',    labelTh: 'อื่นๆ',       labelEn: 'Other',    color: 'zinc',    icon: '•' },
]

export function isEventPhase(v: unknown): v is EventPhase {
  return typeof v === 'string' && ['setup', 'main', 'teardown', 'delivery', 'other'].includes(v)
}

export function getPhaseLabel(phase: string | null | undefined, isEn: boolean): string {
  if (!phase) return isEn ? '—' : '—'
  const cfg = EVENT_PHASES.find(p => p.value === phase)
  if (!cfg) return phase
  return isEn ? cfg.labelEn : cfg.labelTh
}
