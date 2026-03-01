import { createHmac, timingSafeEqual } from 'crypto'

const SESSION_SECRET = process.env.SESSION_SECRET || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'fallback-dev-secret-change-in-production'
const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

/**
 * Creates an HMAC-signed session token.
 * Format: userId:timestamp:signature
 * 
 * The signature covers both userId and timestamp, preventing:
 * - Cookie value tampering (changing userId)
 * - Session replay beyond expiry (timestamp is checked)
 */
export function createSessionToken(userId: string): string {
    const timestamp = Date.now().toString()
    const payload = `${userId}:${timestamp}`
    const signature = createHmac('sha256', SESSION_SECRET)
        .update(payload)
        .digest('hex')
    return `${payload}:${signature}`
}

/**
 * Verifies an HMAC-signed session token and returns the userId if valid.
 * Returns null if the token is invalid, tampered, or expired.
 */
export function verifySessionToken(token: string): { userId: string; timestamp: number } | null {
    if (!token) return null

    const parts = token.split(':')
    if (parts.length !== 3) return null

    const [userId, timestampStr, providedSignature] = parts
    if (!userId || !timestampStr || !providedSignature) return null

    // Verify signature
    const payload = `${userId}:${timestampStr}`
    const expectedSignature = createHmac('sha256', SESSION_SECRET)
        .update(payload)
        .digest('hex')

    // Use timing-safe comparison to prevent timing attacks
    try {
        const sig1 = Buffer.from(providedSignature, 'hex')
        const sig2 = Buffer.from(expectedSignature, 'hex')
        if (sig1.length !== sig2.length || !timingSafeEqual(sig1, sig2)) {
            return null
        }
    } catch {
        return null
    }

    // Check expiry
    const timestamp = parseInt(timestampStr, 10)
    if (isNaN(timestamp)) return null
    if (Date.now() - timestamp > SESSION_MAX_AGE_MS) {
        return null // Session expired
    }

    return { userId, timestamp }
}
