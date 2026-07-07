import { createServer as createHttpServer, type IncomingMessage, type ServerResponse, type Server } from 'node:http'
import { readFile } from 'node:fs/promises'
import { join, normalize, extname } from 'node:path'
import {
  verifyPassword, verifySession, signSession, parseCookies, type Users,
} from './auth.ts'
import type { Store } from './store.ts'

const SESSION_TTL_MS = 30 * 86_400_000
const COOKIE = 'bt_session'

export interface AppConfig {
  store: Store
  users: Users
  secret: string
  secureCookies?: boolean
  /** Directory of built static assets to serve for non-/api routes (prod). */
  staticDir?: string
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
}

function send(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  const payload = Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body))
  res.writeHead(status, {
    'Content-Type': Buffer.isBuffer(body) ? 'application/octet-stream' : 'application/json',
    ...headers,
  })
  res.end(payload)
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size > 64 * 1024 * 1024) { reject(new Error('body too large')); req.destroy() }
      chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

function cookieHeader(token: string, secure: boolean, maxAgeMs: number): string {
  const attrs = [`${COOKIE}=${token}`, 'HttpOnly', 'Path=/', 'SameSite=Lax', `Max-Age=${Math.floor(maxAgeMs / 1000)}`]
  if (secure) attrs.push('Secure')
  return attrs.join('; ')
}

export function createHandler(config: AppConfig) {
  const { store, users, secret, secureCookies = false, staticDir } = config

  const userOf = (req: IncomingMessage): string | null =>
    verifySession(parseCookies(req.headers.cookie)[COOKIE], secret)

  const familyOf = (req: IncomingMessage): string | null => {
    const user = userOf(req)
    return user ? users.get(user)?.family ?? null : null
  }

  return async function handle(req: IncomingMessage, res: ServerResponse) {
    const url = (req.url ?? '/').split('?')[0]
    const method = req.method ?? 'GET'

    try {
      // ---- auth endpoints ----
      if (url === '/api/login' && method === 'POST') {
        const { username, password } = JSON.parse((await readBody(req)).toString() || '{}')
        const record = typeof username === 'string' ? users.get(username) : undefined
        if (!record || typeof password !== 'string' || !verifyPassword(password, record.hash)) {
          return send(res, 401, { error: 'Invalid username or password.' })
        }
        const token = signSession(username, secret, SESSION_TTL_MS)
        return send(res, 200, { user: username }, { 'Set-Cookie': cookieHeader(token, secureCookies, SESSION_TTL_MS) })
      }
      if (url === '/api/logout' && method === 'POST') {
        return send(res, 200, { ok: true }, { 'Set-Cookie': cookieHeader('', secureCookies, 0) })
      }
      if (url === '/api/me' && method === 'GET') {
        const user = userOf(req)
        return user ? send(res, 200, { user }) : send(res, 401, { error: 'Not signed in.' })
      }

      // ---- everything below requires auth ----
      if (url.startsWith('/api/')) {
        if (!userOf(req)) return send(res, 401, { error: 'Not signed in.' })

        if (url === '/api/exec' && method === 'POST') {
          const { sql, params } = JSON.parse((await readBody(req)).toString() || '{}')
          if (typeof sql !== 'string') return send(res, 400, { error: 'Missing sql.' })
          return send(res, 200, { rows: store.exec(sql, Array.isArray(params) ? params : []) })
        }
        if (url === '/api/tx' && method === 'POST') {
          const { statements } = JSON.parse((await readBody(req)).toString() || '{}')
          if (!Array.isArray(statements)) return send(res, 400, { error: 'Missing statements.' })
          return send(res, 200, { results: store.transaction(statements) })
        }
        if (url === '/api/export' && method === 'GET') {
          return send(res, 200, store.serialize(), {
            'Content-Disposition': 'attachment; filename="baby-tracker.sqlite3"',
          })
        }
        if (url === '/api/import' && method === 'POST') {
          store.replace(await readBody(req))
          return send(res, 200, { ok: true })
        }
        return send(res, 404, { error: 'Not found.' })
      }

      // ---- static assets (SPA fallback) ----
      if (staticDir && method === 'GET') {
        return await serveStatic(res, staticDir, url)
      }
      return send(res, 404, { error: 'Not found.' })
    } catch (err) {
      return send(res, 400, { error: String(err instanceof Error ? err.message : err) })
    }
  }
}

async function serveStatic(res: ServerResponse, dir: string, url: string) {
  const rel = normalize(decodeURIComponent(url)).replace(/^(\.\.[/\\])+/, '')
  const candidate = join(dir, rel === '/' || rel === '.' ? 'index.html' : rel)
  try {
    const file = await readFile(candidate)
    return send(res, 200, file, { 'Content-Type': MIME[extname(candidate)] ?? 'application/octet-stream' })
  } catch {
    // SPA fallback: unknown non-file route -> index.html
    try {
      const html = await readFile(join(dir, 'index.html'))
      return send(res, 200, html, { 'Content-Type': 'text/html; charset=utf-8' })
    } catch {
      return send(res, 404, { error: 'Not found.' })
    }
  }
}

export function createServer(config: AppConfig): Server {
  return createHttpServer(createHandler(config))
}
