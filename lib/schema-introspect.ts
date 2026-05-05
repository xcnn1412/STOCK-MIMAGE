/**
 * Schema introspection helpers — used by the /api/schema/* endpoints to
 * report public-schema metadata for drift detection across SaaS instances.
 *
 * Uses the service-role client to query information_schema. Returns plain
 * shapes (no DB types) so the API responses are easy to JSON-serialize.
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

  // Service role is required — anon/authenticated cannot read information_schema
  // because Supabase's PostgREST setup restricts non-public schemas by default.
  const [colRes, idxRes, trigRes, fnRes] = await Promise.all([
    supabase.schema('information_schema' as never)
      .from('columns')
      .select('table_name, column_name, data_type, is_nullable, ordinal_position')
      .eq('table_schema', 'public')
      .order('table_name', { ascending: true })
      .order('ordinal_position', { ascending: true })
      .returns<{ table_name: string; column_name: string; data_type: string; is_nullable: string; ordinal_position: number }[]>(),

    // pg_indexes lives in pg_catalog
    supabase.schema('pg_catalog' as never)
      .from('pg_indexes')
      .select('tablename, indexname')
      .eq('schemaname', 'public')
      .order('tablename', { ascending: true })
      .order('indexname', { ascending: true })
      .returns<{ tablename: string; indexname: string }[]>(),

    supabase.schema('information_schema' as never)
      .from('triggers')
      .select('event_object_table, trigger_name')
      .eq('trigger_schema', 'public')
      .order('event_object_table', { ascending: true })
      .order('trigger_name', { ascending: true })
      .returns<{ event_object_table: string; trigger_name: string }[]>(),

    supabase.schema('information_schema' as never)
      .from('routines')
      .select('routine_name')
      .eq('routine_schema', 'public')
      .eq('routine_type', 'FUNCTION')
      .order('routine_name', { ascending: true })
      .returns<{ routine_name: string }[]>(),
  ])

  if (colRes.error) throw new Error(`columns query: ${colRes.error.message}`)
  if (idxRes.error) throw new Error(`indexes query: ${idxRes.error.message}`)
  if (trigRes.error) throw new Error(`triggers query: ${trigRes.error.message}`)
  if (fnRes.error) throw new Error(`functions query: ${fnRes.error.message}`)

  return {
    columns: (colRes.data ?? []).map(r => ({
      table: r.table_name,
      name: r.column_name,
      type: r.data_type,
      nullable: r.is_nullable === 'YES',
      ordinal: r.ordinal_position,
    })),
    indexes: (idxRes.data ?? []).map(r => ({ table: r.tablename, name: r.indexname })),
    triggers: (trigRes.data ?? []).map(r => ({ table: r.event_object_table, name: r.trigger_name })),
    functions: (fnRes.data ?? []).map(r => ({ name: r.routine_name })),
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
