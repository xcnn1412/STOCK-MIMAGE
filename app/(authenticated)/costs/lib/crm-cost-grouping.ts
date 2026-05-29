// ============================================================================
// CRM cost grouping — roll up all job_cost_events of one CRM lead into a single
// combined cost picture (revenue single-sourced, costs summed across events).
//
// Powers the "By CRM" toggle in the costs dashboard + events list. Cost basis is
// job_cost_items (the costs module's canonical cost); expense_claims are rolled
// up as a SECONDARY cash-flow status summary (not part of the cost basis).
//
// Pure module (no 'use server', no next/* or supabase imports) so it can be
// imported by both client views and server actions.
//
// crm_leads / expense_claims are NOT in types/database.types.ts, so LeadLite /
// ClaimLite are the hand-written contract for exactly the columns the pages select.
// ============================================================================

import { attributeRevenue, type AttributableEvent } from './revenue-attribution'

export interface LeadLite {
  id: string
  customer_name: string | null
  package_name: string | null
  confirmed_price: number | null
  quoted_price: number | null
  vat_mode: string | null
  wht_rate: number | null
  status: string | null
}

export interface ClaimLite {
  id: string
  job_event_id: string | null
  claim_type: string | null
  status: string | null
  amount: number | null
  actual_spent_amount: number | null
}

export interface EventLite extends AttributableEvent {
  event_name: string
  event_location: string | null
  revenue_vat_mode: string | null
  revenue_wht_rate: number | null
  source_event_id: string | null
  status: string | null
  job_cost_items?: { category: string; amount: number | null }[]
}

// ── Expense-claim summary (shared with crm/actions.ts:getLeadCostSummary) ──

export interface ClaimSummary {
  totalClaimed: number // counts toward cost (excludes rejected/cancelled)
  totalPaid: number // paid + refund_confirmed (settled advances at actual_spent)
  totalPending: number // submitted but not yet paid
  claimCount: number
  byStatus: Record<string, { count: number; amount: number }>
}

/** For settled advance claims the real cost is what was actually spent. */
export function claimEffectiveAmount(c: ClaimLite): number {
  return c.claim_type === 'advance' && c.status === 'refund_confirmed' && c.actual_spent_amount != null
    ? Number(c.actual_spent_amount)
    : Number(c.amount || 0)
}

export function summarizeClaims(claims: ClaimLite[]): ClaimSummary {
  let totalClaimed = 0
  let totalPaid = 0
  let totalPending = 0
  let claimCount = 0
  const byStatus: Record<string, { count: number; amount: number }> = {}

  for (const c of claims) {
    if (c.status === 'rejected' || c.status === 'cancelled') continue
    const amt = claimEffectiveAmount(c)
    totalClaimed += amt
    claimCount++
    if (c.status === 'paid' || c.status === 'refund_confirmed') totalPaid += amt
    else totalPending += amt

    const key = c.status || 'unknown'
    byStatus[key] = byStatus[key] || { count: 0, amount: 0 }
    byStatus[key].count++
    byStatus[key].amount += amt
  }

  return { totalClaimed, totalPaid, totalPending, claimCount, byStatus }
}

// ── Grouping ──

export interface CrmCostGroup {
  key: string // leadId, or `event:${id}` for standalone events
  leadId: string | null
  customerName: string | null
  packageName: string | null
  leadStatus: string | null
  revenue: number // single-sourced (deduped) lead revenue
  totalCost: number // SUM(job_cost_items.amount) across the group's events
  profit: number
  costByCategory: { category: string; amount: number }[]
  vatMode: string | null // from the primary (revenue-bearing) event
  whtRate: number
  primaryEventId: string
  events: EventLite[]
  claimSummary: ClaimSummary
  hasRevenue: boolean
}

/**
 * Build one CrmCostGroup per linked CRM lead (events sharing linked_lead_id),
 * plus a standalone single-event group for every unlinked event.
 *
 * A lead with no events in `events` is intentionally absent (it lives in CRM,
 * not in costs yet). Claims whose job_event_id isn't among the loaded events are
 * skipped (mirrors getLeadCostSummary, which only fetches claims for known ids).
 */
export function buildCrmCostGroups(
  events: EventLite[],
  leadsById: Map<string, LeadLite>,
  claims: ClaimLite[],
): CrmCostGroup[] {
  const leadPriceById = new Map<string, number>()
  for (const [id, l] of leadsById) {
    leadPriceById.set(id, Number(l.confirmed_price || l.quoted_price || 0))
  }
  const attributed = attributeRevenue(events, leadPriceById)

  const claimsByEvent = new Map<string, ClaimLite[]>()
  for (const c of claims) {
    if (!c.job_event_id) continue
    const arr = claimsByEvent.get(c.job_event_id)
    if (arr) arr.push(c)
    else claimsByEvent.set(c.job_event_id, [c])
  }

  const linkedGroups = new Map<string, EventLite[]>()
  const standalone: EventLite[] = []
  for (const e of events) {
    if (e.linked_lead_id) {
      const g = linkedGroups.get(e.linked_lead_id)
      if (g) g.push(e)
      else linkedGroups.set(e.linked_lead_id, [e])
    } else {
      standalone.push(e)
    }
  }

  const build = (
    key: string,
    leadId: string | null,
    lead: LeadLite | undefined,
    groupEvents: EventLite[],
  ): CrmCostGroup => {
    let totalCost = 0
    const catMap: Record<string, number> = {}
    for (const e of groupEvents) {
      for (const it of e.job_cost_items || []) {
        const amt = Number(it.amount || 0)
        totalCost += amt
        catMap[it.category] = (catMap[it.category] || 0) + amt
      }
    }
    const revenue = groupEvents.reduce((s, e) => s + (attributed.get(e.id) || 0), 0)
    const primary = groupEvents.find((e) => (attributed.get(e.id) || 0) > 0) || groupEvents[0]
    const groupClaims = groupEvents.flatMap((e) => claimsByEvent.get(e.id) || [])
    const costByCategory = Object.entries(catMap)
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount)

    return {
      key,
      leadId,
      customerName: lead?.customer_name ?? primary.event_name,
      packageName: lead?.package_name ?? null,
      leadStatus: lead?.status ?? null,
      revenue,
      totalCost,
      profit: revenue - totalCost,
      costByCategory,
      vatMode: primary.revenue_vat_mode,
      whtRate: Number(primary.revenue_wht_rate || 0),
      primaryEventId: primary.id,
      events: groupEvents,
      claimSummary: summarizeClaims(groupClaims),
      hasRevenue: revenue > 0,
    }
  }

  const groups: CrmCostGroup[] = []
  for (const [leadId, groupEvents] of linkedGroups) {
    groups.push(build(leadId, leadId, leadsById.get(leadId), groupEvents))
  }
  for (const e of standalone) {
    groups.push(build(`event:${e.id}`, null, undefined, [e]))
  }
  return groups
}
