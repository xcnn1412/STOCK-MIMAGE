/**
 * Schema introspection — wraps the `public.get_schema_summary()` RPC.
 *
 * We can't query `information_schema` directly via supabase-js because
 * PostgREST only exposes a whitelist of schemas (public / storage /
 * graphql_public). The RPC keeps the call inside `public` while the
 * function body (SECURITY DEFINER) does the cross-schema reads.
 *
 * The `get_schema_summary()` function is created by the migration file
 * supabase/migrations/20260505_add_schema_introspect_rpc.sql — apply it
 * on each DB (master + every instance) before /checkupdate will work.
 */

import { createServiceClient } from './supabase-server'
import { createHash } from 'crypto'

export interface ColumnInfo {
  table: string
  name: string
  type: string
  nullable: boolean
  ordinal: number
}

export interface IndexInfo { table: string; name: string }
export interface TriggerInfo { table: string; name: string }
export interface FunctionInfo { name: string }

export interface SchemaSummary {
  columns: ColumnInfo[]
  indexes: IndexInfo[]
  triggers: TriggerInfo[]
  functions: FunctionInfo[]
}

export async function readPublicSchema(): Promise<SchemaSummary> {
  const supabase = createServiceClient()
  const { data, error } = await supabase.rpc('get_schema_summary')

  if (error) {
    // Friendlier hint when the helper hasn't been installed yet.
    if (error.message.includes('Could not find') || error.code === 'PGRST202') {
      throw new Error(
        'get_schema_summary() RPC not found on this database. Apply ' +
        'supabase/migrations/20260505_add_schema_introspect_rpc.sql first.'
      )
    }
    throw new Error(error.message)
  }

  // Defensive defaults — the RPC always returns arrays but we coerce
  // in case a future migration ever changes its shape.
  const d = (data ?? {}) as Partial<SchemaSummary>
  return {
    columns:   d.columns   ?? [],
    indexes:   d.indexes   ?? [],
    triggers:  d.triggers  ?? [],
    functions: d.functions ?? [],
  }
}

/**
 * Single deterministic fingerprint summarising the public schema. Two DBs
 * with the same fingerprint are guaranteed to be in sync at this granularity.
 * Different fingerprints → run /api/schema/full to see what differs.
 */
export function computeFingerprint(s: SchemaSummary): string {
  const parts = [
    s.columns.map(c => `${c.table}.${c.name}:${c.type}${c.nullable ? '?' : ''}`).join(','),
    s.indexes.map(i => `${i.table}.${i.name}`).join(','),
    s.triggers.map(t => `${t.table}.${t.name}`).join(','),
    s.functions.map(f => f.name).join(','),
  ]
  return createHash('md5').update(parts.join('|')).digest('hex')
}
