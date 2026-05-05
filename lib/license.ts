/**
 * Subscription license gate.
 *
 * Two env vars drive the whole system:
 *   LICENSE_EXPIRES_AT          ISO 8601 UTC timestamp, e.g. 2027-05-05T00:00:00Z
 *   LICENSE_EXPIRED_REDIRECT_URL  external URL where expired instances are redirected
 *
 * Fail-closed: if LICENSE_EXPIRES_AT is missing or unparseable, the instance is
 * treated as expired. This prevents a forgotten env var from giving an instance
 * unlimited access.
 *
 * Usable from both edge middleware and server components — the only Node API
 * touched is `process.env`, which Next.js polyfills on the edge.
 */

export interface LicenseStatus {
  /** True when the license is past expiry, env is missing, or env is malformed. */
  expired: boolean
  /** Parsed expiry, or null when env is missing/malformed. */
  expiresAt: Date | null
  /** Whole days until expiry (negative if past). null when not configured. */
  daysLeft: number | null
  /** False when env is missing or unparseable. */
  configured: boolean
}

const DAY_MS = 86_400_000

export function getLicenseStatus(now: Date = new Date()): LicenseStatus {
  const raw = (process.env.LICENSE_EXPIRES_AT || '').trim()
  if (!raw) {
    return { expired: true, expiresAt: null, daysLeft: null, configured: false }
  }
  const expiresAt = new Date(raw)
  if (Number.isNaN(expiresAt.getTime())) {
    return { expired: true, expiresAt: null, daysLeft: null, configured: false }
  }
  const diffMs = expiresAt.getTime() - now.getTime()
  return {
    expired: diffMs <= 0,
    expiresAt,
    daysLeft: Math.ceil(diffMs / DAY_MS),
    configured: true,
  }
}

export function getExpiredRedirectUrl(): string {
  return (process.env.LICENSE_EXPIRED_REDIRECT_URL || 'https://imageautomat.com').trim()
}
