/**
 * In-memory rate limiter for login attempts.
 * Limits: 5 attempts per 15 minutes per key (IP + phone).
 * Note: Resets on server restart. For multi-instance, use Redis.
 */

const WINDOW_MS = 15 * 60 * 1000 // 15 minutes
const MAX_ATTEMPTS = 5

interface RateLimitEntry {
  count: number
  firstAttempt: number
}

const store = new Map<string, RateLimitEntry>()

// Cleanup old entries periodically when store gets large
function cleanupExpired() {
  const now = Date.now()
  for (const [key, entry] of store.entries()) {
    if (now - entry.firstAttempt > WINDOW_MS) {
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

  // No entry or window expired — allow
  if (!entry || now - entry.firstAttempt > WINDOW_MS) {
    store.set(key, { count: 1, firstAttempt: now })
    return { allowed: true, remaining: MAX_ATTEMPTS - 1, retryAfterMinutes: 0 }
  }

  // Within window
  entry.count++

  if (entry.count > MAX_ATTEMPTS) {
    const msLeft = WINDOW_MS - (now - entry.firstAttempt)
    const minutesLeft = Math.ceil(msLeft / 60000)
    return { allowed: false, remaining: 0, retryAfterMinutes: minutesLeft }
  }

  return { allowed: true, remaining: MAX_ATTEMPTS - entry.count, retryAfterMinutes: 0 }
}
