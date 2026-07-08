// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { createServer } from './app'
import { openStore } from './store'
import { hashPassword } from './auth'

let server: Server
let base: string

beforeAll(async () => {
  const store = openStore(':memory:')
  const users = new Map([
    ['alice', { family: 'testfam', hash: hashPassword('pw123') }],
    ['bob', { family: 'otherfam', hash: hashPassword('pw123') }],
  ])
  server = createServer({ store, users, secret: 'itsasecret' })
  await new Promise<void>((r) => server.listen(0, r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(() => new Promise<void>((r) => server.close(() => r())))

async function login(user = 'alice', pw = 'pw123'): Promise<string> {
  const res = await fetch(`${base}/api/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: user, password: pw }),
  })
  expect(res.status).toBe(200)
  return res.headers.get('set-cookie')!.split(';')[0]
}

async function q(cookie: string, name: string, args: unknown, headers: Record<string, string> = {}) {
  return fetch(`${base}/api/q`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie, ...headers },
    body: JSON.stringify({ name, args }),
  })
}

describe('auth flow', () => {
  it('rejects bad credentials', async () => {
    const res = await fetch(`${base}/api/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'alice', password: 'nope' }),
    })
    expect(res.status).toBe(401)
  })
  it('accepts good credentials and issues a cookie', async () => {
    const cookie = await login()
    expect(cookie).toContain('bt_session=')
  })
  it('gates /api/me and /api/q without a cookie', async () => {
    expect((await fetch(`${base}/api/me`)).status).toBe(401)
    const res = await fetch(`${base}/api/q`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'listBabies', args: {} }),
    })
    expect(res.status).toBe(401)
  })
  it('recognizes the session on /api/me', async () => {
    const cookie = await login()
    const res = await fetch(`${base}/api/me`, { headers: { cookie } })
    expect(res.status).toBe(200)
    expect((await res.json()).user).toBe('alice')
  })
})

describe('q dispatch', () => {
  it('creates a family-scoped baby then inserts and lists a baby-scoped entry', async () => {
    const cookie = await login()
    const add = await q(cookie, 'addBaby', { name: 'A', dob: null })
    expect(add.status).toBe(200)
    const babyId = Number((await add.json()).rows[0].id)
    expect(babyId).toBeGreaterThan(0)

    const insert = await q(cookie, 'insertEntry', { type: 'bottle', start_ts: 1000 }, { 'X-Baby-Id': String(babyId) })
    expect(insert.status).toBe(200)
    const entryId = Number((await insert.json()).rows[0].id)
    expect(entryId).toBeGreaterThan(0)

    const list = await q(cookie, 'listEntries', {}, { 'X-Baby-Id': String(babyId) })
    expect(list.status).toBe(200)
    const rows = (await list.json()).rows
    expect(rows.map((r: { id: number }) => r.id)).toContain(entryId)
    expect(rows[0].type).toBe('bottle')
  })
})

describe('X-Baby-Id family enforcement', () => {
  it('rejects a baby from another family with 403 (read path)', async () => {
    const aliceCookie = await login('alice')
    const bobCookie = await login('bob')
    const bobBaby = Number((await (await q(bobCookie, 'addBaby', { name: 'B', dob: null })).json()).rows[0].id)

    const res = await q(aliceCookie, 'listEntries', {}, { 'X-Baby-Id': String(bobBaby) })
    expect(res.status).toBe(403)
  })

  it('rejects a foreign baby on the write path with 403', async () => {
    const aliceCookie = await login('alice')
    const bobCookie = await login('bob')
    const bobBaby = Number((await (await q(bobCookie, 'addBaby', { name: 'B2', dob: null })).json()).rows[0].id)

    const res = await q(aliceCookie, 'insertEntry', { type: 'sleep', start_ts: 1 }, { 'X-Baby-Id': String(bobBaby) })
    expect(res.status).toBe(403)
  })

  it('returns 400 when a baby-scoped query has no X-Baby-Id header', async () => {
    const cookie = await login()
    const res = await q(cookie, 'listEntries', {})
    expect(res.status).toBe(400)
  })

  it('allows a family-scoped query with no baby header', async () => {
    const cookie = await login()
    const res = await q(cookie, 'listBabies', {})
    expect(res.status).toBe(200)
  })
})

describe('export/import round-trip', () => {
  it('exports bytes and imports them back', async () => {
    const cookie = await login()
    const seed = await q(cookie, 'setSetting', { key: 'units', value: 'oz' })
    expect(seed.status).toBe(200)

    const exported = Buffer.from(await (await fetch(`${base}/api/export`, { headers: { cookie } })).arrayBuffer())
    expect(exported.subarray(0, 16).toString()).toBe('SQLite format 3\0')

    const imp = await fetch(`${base}/api/import`, {
      method: 'POST', headers: { cookie }, body: exported,
    })
    expect(imp.status).toBe(200)

    const check = await q(cookie, 'getSetting', { key: 'units' })
    expect((await check.json()).rows[0].value).toBe('oz')
  })
})

describe('admin-scoped backup', () => {
  it('blocks export/import for a non-admin family when adminFamily is set', async () => {
    const adminStore = openStore(':memory:')
    const adminUsers = new Map([
      ['alice', { family: 'testfam', hash: hashPassword('pw123') }],
    ])
    const adminServer = createServer({
      store: adminStore, users: adminUsers, secret: 'itsasecret', adminFamily: 'someotherfam',
    })
    await new Promise<void>((r) => adminServer.listen(0, r))
    try {
      const adminBase = `http://127.0.0.1:${(adminServer.address() as AddressInfo).port}`

      const loginRes = await fetch(`${adminBase}/api/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'alice', password: 'pw123' }),
      })
      expect(loginRes.status).toBe(200)
      const cookie = loginRes.headers.get('set-cookie')!.split(';')[0]

      const exportRes = await fetch(`${adminBase}/api/export`, { headers: { cookie } })
      expect(exportRes.status).toBe(403)

      const importRes = await fetch(`${adminBase}/api/import`, {
        method: 'POST', headers: { cookie }, body: Buffer.from('irrelevant'),
      })
      expect(importRes.status).toBe(403)
    } finally {
      await new Promise<void>((r) => adminServer.close(() => r()))
    }
  })
})
