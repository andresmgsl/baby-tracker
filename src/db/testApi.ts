import Database from 'better-sqlite3'
import { SCHEMA_SQL } from './schema'
import type { Api } from './client'
import type { Row } from './executor'
import { QUERIES, type QueryCtx } from '../../server/queries'

export interface TestApi { db: Api; raw: Database.Database; babyId: number; family: string }

export function makeTestApi(opts: { family?: string } = {}): TestApi {
  const family = opts.family ?? 'testfam'
  const raw = new Database(':memory:')
  raw.exec(SCHEMA_SQL)
  const run = (sql: string, params: unknown[] = []): Row[] => {
    const stmt = raw.prepare(sql)
    if (stmt.reader) return stmt.all(...(params as never[])) as Row[]
    stmt.run(...(params as never[])); return []
  }
  const babyId = Number((run(
    `INSERT INTO babies (family,name,sort_order,created_at,updated_at) VALUES (?, 'Baby', 0, 1, 1) RETURNING id`,
    [family],
  ))[0].id)
  const ctx: QueryCtx = { family, babyId }
  const db: Api = {
    async q(name, args = {}) {
      const def = QUERIES[name]
      if (!def) throw new Error(`Unknown query: ${name}`)
      return def.run({ run }, ctx, args) as never
    },
    async tx(ops) { return ops.map((op) => QUERIES[op.name].run({ run }, ctx, op.args ?? {})) as never },
    async exportBytes() { return raw.serialize() },
    async importBytes() { /* not used in tests */ },
  }
  return { db, raw, babyId, family }
}
