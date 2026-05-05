import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { readPublicSchema, computeFingerprint } from '@/lib/schema-introspect'
import { getAppliedMigrations, type AppliedMigration } from './actions'
import CheckUpdateView from './check-update-view'

export const metadata = { title: 'Schema Sync Check' }
export const revalidate = 0

interface FingerprintResponse {
  fingerprint: string
  counts?: Record<string, number>
  checked_at: string
}
interface ManifestResponse {
  count: number
  manifest_checksum: string
  items: { filename: string; checksum: string; size: number }[]
  checked_at: string
}

export default async function CheckUpdatePage() {
  const cookieStore = await cookies()
  const role = cookieStore.get('session_role')?.value || 'staff'
  if (role !== 'admin') redirect('/dashboard')

  const masterApiUrl = (process.env.MASTER_API_URL || '').replace(/\/$/, '')

  // 1. Read local schema + applied-migration log + master metadata in parallel.
  //    Done concurrently so first paint isn't waiting on the slowest leg.
  const [localResult, appliedResult, masterRemote] = await Promise.allSettled([
    (async () => {
      const schema = await readPublicSchema()
      return { schema, fingerprint: computeFingerprint(schema) }
    })(),
    getAppliedMigrations(),
    (async () => {
      if (!masterApiUrl) {
        throw new Error(
          'MASTER_API_URL is not configured. Set it to the master site URL (e.g. https://master.example.com) in this instance\'s env.'
        )
      }
      const [fpRes, manRes] = await Promise.all([
        fetch(`${masterApiUrl}/api/schema/fingerprint`, { cache: 'no-store' }),
        fetch(`${masterApiUrl}/api/migrations/list`, { cache: 'no-store' }),
      ])
      if (!fpRes.ok) throw new Error(`fingerprint: HTTP ${fpRes.status}`)
      if (!manRes.ok) throw new Error(`manifest: HTTP ${manRes.status}`)
      const fp: FingerprintResponse = await fpRes.json()
      const man: ManifestResponse = await manRes.json()
      return { fp, man }
    })(),
  ])

  const local = localResult.status === 'fulfilled' ? localResult.value : null
  const localError = localResult.status === 'rejected'
    ? (localResult.reason instanceof Error ? localResult.reason.message : String(localResult.reason))
    : null

  // appliedResult always resolves (errors are caught inside getAppliedMigrations).
  const applied: AppliedMigration[] = appliedResult.status === 'fulfilled' ? appliedResult.value.data : []
  const trackingBootstrapped = appliedResult.status === 'fulfilled' ? appliedResult.value.bootstrapped : false

  const masterFp = masterRemote.status === 'fulfilled' ? masterRemote.value.fp : null
  const masterManifest = masterRemote.status === 'fulfilled' ? masterRemote.value.man : null
  const masterError = masterRemote.status === 'rejected'
    ? (masterRemote.reason instanceof Error ? masterRemote.reason.message : String(masterRemote.reason))
    : null

  return (
    <CheckUpdateView
      masterApiUrl={masterApiUrl}
      localSchema={local?.schema ?? null}
      localFingerprint={local?.fingerprint ?? ''}
      localError={localError}
      masterFingerprint={masterFp}
      masterManifest={masterManifest}
      masterError={masterError}
      appliedMigrations={applied}
      trackingBootstrapped={trackingBootstrapped}
    />
  )
}
