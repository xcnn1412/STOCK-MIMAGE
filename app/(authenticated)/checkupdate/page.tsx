import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { readPublicSchema, computeFingerprint, type SchemaSummary } from '@/lib/schema-introspect'
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

  // 1. Read local schema upfront — service role on this instance.
  let local: { schema: SchemaSummary; fingerprint: string } | null = null
  let localError: string | null = null
  try {
    const schema = await readPublicSchema()
    local = { schema, fingerprint: computeFingerprint(schema) }
  } catch (e) {
    localError = e instanceof Error ? e.message : String(e)
  }

  // 2. Fetch master's fingerprint + migration manifest in parallel.
  let masterFp: FingerprintResponse | null = null
  let masterManifest: ManifestResponse | null = null
  let masterError: string | null = null

  if (!masterApiUrl) {
    masterError = 'MASTER_API_URL is not configured. Set it to the master site URL (e.g. https://master.example.com) in this instance\'s env.'
  } else {
    try {
      const [fpRes, manRes] = await Promise.all([
        fetch(`${masterApiUrl}/api/schema/fingerprint`, { cache: 'no-store' }),
        fetch(`${masterApiUrl}/api/migrations/list`, { cache: 'no-store' }),
      ])
      if (!fpRes.ok) throw new Error(`fingerprint: HTTP ${fpRes.status}`)
      if (!manRes.ok) throw new Error(`manifest: HTTP ${manRes.status}`)
      masterFp = await fpRes.json()
      masterManifest = await manRes.json()
    } catch (e) {
      masterError = e instanceof Error ? e.message : String(e)
    }
  }

  return (
    <CheckUpdateView
      masterApiUrl={masterApiUrl}
      localSchema={local?.schema ?? null}
      localFingerprint={local?.fingerprint ?? ''}
      localError={localError}
      masterFingerprint={masterFp}
      masterManifest={masterManifest}
      masterError={masterError}
    />
  )
}
