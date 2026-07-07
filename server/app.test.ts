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
  const users = new Map([['alice', { family: 'testfam', hash: hashPassword('pw123') }]])
  server = createServer({ store, users, secret: 'itsasecret' })
  await new Promise<void>((r) => server.listen(0, r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(() => new Promise<void>((r) => server.close(() => r())))

async function login(): Promise<string> {
  const res = await fetch(`${base}/api/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'alice', password: 'pw123' }),
  })
  expect(res.status).toBe(200)
  return res.headers.get('set-cookie')!.split(';')[0]
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
  it('gates /api/me and /api/exec without a cookie', async () => {
    expect((await fetch(`${base}/api/me`)).status).toBe(401)
    const res = await fetch(`${base}/api/exec`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql: 'SELECT 1' }),
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

describe('exec', () => {
  it('inserts and reads back an entry through the shared store', async () => {
    const cookie = await login()
    const insert = await fetch(`${base}/api/exec`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify({
        sql: 'INSERT INTO entries (type,start_ts,created_at,updated_at) VALUES (?,?,?,?) RETURNING id',
        params: ['bottle', 1000, 1000, 1000],
      }),
    })
    const { rows } = await insert.json()
    expect(rows[0].id).toBeGreaterThan(0)

    const list = await fetch(`${base}/api/exec`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify({ sql: 'SELECT type FROM entries WHERE id = ?', params: [rows[0].id] }),
    })
    expect((await list.json()).rows[0].type).toBe('bottle')
  })
})

describe('export/import round-trip', () => {
  it('exports bytes and imports them back', async () => {
    const cookie = await login()
    await fetch(`${base}/api/exec`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify({ sql: "INSERT INTO settings (key,value) VALUES ('baby_name','Iris')" }),
    })
    const exported = Buffer.from(await (await fetch(`${base}/api/export`, { headers: { cookie } })).arrayBuffer())
    expect(exported.subarray(0, 16).toString()).toBe('SQLite format 3\0')

    const imp = await fetch(`${base}/api/import`, {
      method: 'POST', headers: { cookie }, body: exported,
    })
    expect(imp.status).toBe(200)
    const check = await fetch(`${base}/api/exec`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify({ sql: "SELECT value FROM settings WHERE key='baby_name'" }),
    })
    expect((await check.json()).rows[0].value).toBe('Iris')
  })
})
