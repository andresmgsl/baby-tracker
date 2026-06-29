import Database from 'better-sqlite3'
import type { SqlExecutor, Row } from './executor'
import { SCHEMA_SQL } from './schema'

function wrap(db: Database.Database): SqlExecutor {
  const exec = async (sql: string, params: unknown[] = []): Promise<Row[]> => {
    const stmt = db.prepare(sql)
    if (stmt.reader) return stmt.all(...(params as never[])) as Row[]
    stmt.run(...(params as never[]))
    return []
  }
  return {
    exec,
    async transaction(fn) {
      db.exec('BEGIN')
      try {
        const result = await fn(wrap(db))
        db.exec('COMMIT')
        return result
      } catch (err) {
        db.exec('ROLLBACK')
        throw err
      }
    },
    async close() {
      db.close()
    },
  }
}

export async function makeTestExecutor(): Promise<SqlExecutor> {
  const db = new Database(':memory:')
  db.exec(SCHEMA_SQL)
  return wrap(db)
}
