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
 *
 * ผู้เรียกอื่น (เช่น /api/mcp — 60 ครั้ง/นาที/การเชื่อมต่อ) ส่ง options มาเองได้
 * ไม่ส่ง = กติกาล็อกอินเดิม (5 ครั้ง / 15 นาที + ล็อก 30 นาที)
 */

const WINDOW_MS = 15 * 60 * 1000 // 15 minutes
const MAX_ATTEMPTS = 5
const EXTENDED_LOCKOUT_MS = 30 * 60 * 1000 // 30 minutes after exceeding max

export interface RateLimitOptions {
  /** จำนวนครั้งที่ยอมในหนึ่งช่วง (ค่าเริ่มต้น 5) */
  limit?: number
  /** ความยาวช่วง ms (ค่าเริ่มต้น 15 นาที) */
  windowMs?: number
  /** ล็อกต่อเมื่อเกิน ms — 0 = ไม่ล็อกเพิ่ม แค่รอให้ช่วงหมด (ค่าเริ่มต้น 30 นาที) */
  lockoutMs?: number
}

interface RateLimitEntry {
  count: number
  firstAttempt: number
  windowMs: number
  lockedUntil?: number // Extended lockout timestamp
}

const store = new Map<string, RateLimitEntry>()

// Cleanup old entries periodically when store gets large
function cleanupExpired() {
  const now = Date.now()
  for (const [key, entry] of store.entries()) {
    const expiry = entry.lockedUntil || (entry.firstAttempt + entry.windowMs)
    if (now > expiry) {
      store.delete(key)
    }
  }
}

export function checkRateLimit(key: string, options: RateLimitOptions = {}): {
  allowed: boolean
  remaining: number
  retryAfterMinutes: number
  /** วินาทีที่ต้องรอ (0 เมื่อ allowed) */
  retryAfterSeconds: number
} {
  const limit = options.limit ?? MAX_ATTEMPTS
  const windowMs = options.windowMs ?? WINDOW_MS
  const lockoutMs = options.lockoutMs ?? EXTENDED_LOCKOUT_MS

  // Cleanup if store gets large
  if (store.size > 500) cleanupExpired()

  const now = Date.now()
  const entry = store.get(key)
  const denied = (msLeft: number) => ({
    allowed: false,
    remaining: 0,
    retryAfterMinutes: Math.ceil(msLeft / 60000),
    retryAfterSeconds: Math.max(1, Math.ceil(msLeft / 1000)),
  })

  // Check extended lockout first
  if (entry?.lockedUntil && now < entry.lockedUntil) {
    return denied(entry.lockedUntil - now)
  }

  // No entry or window expired — allow
  if (!entry || now - entry.firstAttempt > entry.windowMs) {
    store.set(key, { count: 1, firstAttempt: now, windowMs })
    return { allowed: true, remaining: limit - 1, retryAfterMinutes: 0, retryAfterSeconds: 0 }
  }

  // Within window
  entry.count++

  if (entry.count > limit) {
    if (lockoutMs > 0) {
      // Apply extended lockout for persistent attempts
      entry.lockedUntil = now + lockoutMs
      return denied(lockoutMs)
    }
    // ไม่ล็อกเพิ่ม — รอจนช่วงปัจจุบันหมด
    return denied(entry.firstAttempt + entry.windowMs - now)
  }

  return { allowed: true, remaining: limit - entry.count, retryAfterMinutes: 0, retryAfterSeconds: 0 }
}

/**
 * Reset rate limit for a specific key (e.g., after successful login).
 */
export function resetRateLimit(key: string): void {
  store.delete(key)
}
