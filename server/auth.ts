import {
  scryptSync, randomBytes, timingSafeEqual, createHmac,
} from 'node:crypto'

// ---- password hashing (scrypt, no external deps) ----

export function hashPassword(password: string): string {
  const salt = randomBytes(16)
  const key = scryptSync(password, salt, 64)
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, saltB64, keyB64] = stored.split('$')
  if (scheme !== 'scrypt' || !saltB64 || !keyB64) return false
  const salt = Buffer.from(saltB64, 'base64')
  const key = Buffer.from(keyB64, 'base64')
  const test = scryptSync(password, salt, key.length)
  return key.length === test.length && timingSafeEqual(key, test)
}

// ---- user table parsing ----
// BT_USERS format: "alice:scrypt$salt$hash,bob:scrypt$salt$hash"
// (base64 never contains ':' or ',', so this split is unambiguous)

export type Users = Map<string, string>

export function parseUsers(raw: string | undefined): Users {
  const users: Users = new Map()
  if (!raw) return users
  for (const entry of raw.split(',')) {
    const trimmed = entry.trim()
    if (!trimmed) continue
    const idx = trimmed.indexOf(':')
    if (idx <= 0) continue
    users.set(trimmed.slice(0, idx), trimmed.slice(idx + 1))
  }
  return users
}

// ---- signed session cookie (stateless HMAC token) ----

const b64url = (buf: Buffer) => buf.toString('base64url')

export function signSession(username: string, secret: string, ttlMs = 30 * 86_400_000, nowMs = Date.now()): string {
  const payload = b64url(Buffer.from(JSON.stringify({ u: username, exp: nowMs + ttlMs })))
  const sig = b64url(createHmac('sha256', secret).update(payload).digest())
  return `${payload}.${sig}`
}

export function verifySession(token: string | undefined, secret: string, nowMs = Date.now()): string | null {
  if (!token) return null
  const dot = token.indexOf('.')
  if (dot < 0) return null
  const payload = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  const expected = b64url(createHmac('sha256', secret).update(payload).digest())
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  try {
    const { u, exp } = JSON.parse(Buffer.from(payload, 'base64url').toString())
    if (typeof u !== 'string' || typeof exp !== 'number' || exp < nowMs) return null
    return u
  } catch {
    return null
  }
}

// ---- cookie parsing ----

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  if (!header) return out
  for (const part of header.split(';')) {
    const idx = part.indexOf('=')
    if (idx < 0) continue
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim())
  }
  return out
}
