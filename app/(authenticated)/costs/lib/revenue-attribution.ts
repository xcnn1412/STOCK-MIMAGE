// ============================================================================
// Revenue attribution — single-source CRM revenue across multi-event leads.
//
// One CRM lead (crm_leads) can fan out to N job_cost_events (setup / main /
// teardown / delivery) via job_cost_events.linked_lead_id. The write paths
// (createEventFromLead, importEventFromStock, syncRevenueFromCRM) stamp the
// lead's FULL price onto EVERY event, so any code that SUM(revenue) across
// events double-counts a lead's revenue.
//
// This pure helper fixes that at the read layer: per linked_lead_id group, the
// lead's revenue is attributed to exactly ONE "primary" event; siblings get 0.
// Events not linked to a lead keep their own revenue. Every aggregation site
// maps `event.revenue` -> `attributeRevenue(events).get(event.id)` before summing.
//
// Pure: does not mutate inputs (safe under reactCompiler). Deterministic primary
// pick so SSR and client agree (no hydration mismatch).
// ============================================================================

export interface AttributableEvent {
  id: string
  linked_lead_id: string | null
  phase: string | null
  event_date: string | null
  revenue: number | null
}

/**
 * Pick the single revenue-bearing event of a lead group.
 * Order: phase === 'main' -> earliest event_date -> smallest id (stable tiebreak).
 */
function pickPrimary<E extends AttributableEvent>(group: E[]): E {
  return group.reduce((best, e) => {
    const eMain = e.phase === 'main'
    const bestMain = best.phase === 'main'
    if (eMain !== bestMain) return eMain ? e : best

    const ed = e.event_date
    const bd = best.event_date
    if (ed !== bd) {
      if (!ed) return best // null dates sort last
      if (!bd) return e
      return ed < bd ? e : best
    }

    return e.id < best.id ? e : best
  })
}

/**
 * Returns Map<eventId, attributedRevenue>.
 *
 * @param events  all job cost events being aggregated
 * @param leadPriceById  optional map leadId -> lead price (confirmed||quoted).
 *   When provided and > 0, it is the single source of truth for the group's
 *   revenue. When absent/0, falls back to the max stored revenue in the group
 *   (robust to inconsistent per-event snapshots; never lowers an already-synced
 *   total — non-destructive).
 */
export function attributeRevenue<E extends AttributableEvent>(
  events: E[],
  leadPriceById?: Map<string, number>,
): Map<string, number> {
  const result = new Map<string, number>()
  const groups = new Map<string, E[]>()

  for (const e of events) {
    if (!e.linked_lead_id) {
      result.set(e.id, Number(e.revenue || 0))
      continue
    }
    const g = groups.get(e.linked_lead_id)
    if (g) g.push(e)
    else groups.set(e.linked_lead_id, [e])
  }

  for (const [leadId, group] of groups) {
    const primary = pickPrimary(group)
    const leadPrice = leadPriceById?.get(leadId)
    const groupRevenue =
      leadPrice && leadPrice > 0
        ? leadPrice
        : group.reduce((max, e) => Math.max(max, Number(e.revenue || 0)), 0)

    for (const e of group) {
      result.set(e.id, e.id === primary.id ? groupRevenue : 0)
    }
  }

  return result
}
