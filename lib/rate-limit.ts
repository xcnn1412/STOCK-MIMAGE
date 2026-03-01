/**
 * Rate limiter for login attempts.
 * 
 * Primary: In-memory Map (fast, resets on server restart)
 * For multi-instance deployments, consider adding Redis or DB-backed store.
 * 
 * Policy: 5 attempts per 15 minutes per key (IP + phone).
 * After exceeding the limit, the user must wait until the window expires.
 * 
 * Enhancement: After MAX_ATTEMPTS, additional attempts extend the lockout
 * to discourage persistent brute-force attacks.
 */

const WINDOW_MS = 15 * 60 * 1000 // 15 minutes
const MAX_ATTEMPTS = 5
const EXTENDED_LOCKOUT_MS = 30 * 60 * 1000 // 30 minutes after exceeding max

interface RateLimitEntry {
  count: number
  firstAttempt: number
  lockedUntil?: number // Extended lockout timestamp
}

const store = new Map<string, RateLimitEntry>()

// Cleanup old entries periodically when store gets large
function cleanupExpired() {
  const now = Date.now()
  for (const [key, entry] of store.entries()) {
    const expiry = entry.lockedUntil || (entry.firstAttempt + WINDOW_MS)
    if (now > expiry) {
      store.delete(key)
    }
  }
}

export function checkRateLimit(key: string): {
  allowed: boolean
  remaining: number
  retryAfterMinutes: number
} {
  // Cleanup if store gets large
  if (store.size > 500) cleanupExpired()

  const now = Date.now()
  const entry = store.get(key)

  // Check extended lockout first
  if (entry?.lockedUntil && now < entry.lockedUntil) {
    const msLeft = entry.lockedUntil - now
    const minutesLeft = Math.ceil(msLeft / 60000)
    return { allowed: false, remaining: 0, retryAfterMinutes: minutesLeft }
  }

  // No entry or window expired — allow
  if (!entry || now - entry.firstAttempt > WINDOW_MS) {
    store.set(key, { count: 1, firstAttempt: now })
    return { allowed: true, remaining: MAX_ATTEMPTS - 1, retryAfterMinutes: 0 }
  }

  // Within window
  entry.count++

  if (entry.count > MAX_ATTEMPTS) {
    // Apply extended lockout for persistent attempts
    entry.lockedUntil = now + EXTENDED_LOCKOUT_MS
    const minutesLeft = Math.ceil(EXTENDED_LOCKOUT_MS / 60000)
    return { allowed: false, remaining: 0, retryAfterMinutes: minutesLeft }
  }

  return { allowed: true, remaining: MAX_ATTEMPTS - entry.count, retryAfterMinutes: 0 }
}

/**
 * Reset rate limit for a specific key (e.g., after successful login).
 */
export function resetRateLimit(key: string): void {
  store.delete(key)
}
