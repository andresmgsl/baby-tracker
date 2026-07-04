import sqlite3InitModule from '@sqlite.org/sqlite-wasm'
import { SCHEMA_SQL } from './schema'

type ExecMsg = { id: number; kind: 'exec'; sql: string; params: unknown[] }
type ExportMsg = { id: number; kind: 'export' }
type ImportMsg = { id: number; kind: 'import'; bytes: Uint8Array }
type Msg = ExecMsg | ExportMsg | ImportMsg

const DB_NAME = 'baby-tracker.sqlite3'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sqlite3: any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any

async function ready() {
  if (db) return db
  if (!sqlite3) sqlite3 = await sqlite3InitModule()
  // OPFS persistent VFS; requires running inside a Worker.
  db = new sqlite3.oo1.OpfsDb(DB_NAME)
  db.exec(SCHEMA_SQL)
  return db
}

async function runExec(sql: string, params: unknown[]) {
  const d = await ready()
  const rows: Record<string, unknown>[] = []
  d.exec({ sql, bind: params as never, rowMode: 'object', resultRows: rows })
  return rows
}

const post = (msg: Record<string, unknown>, transfer: Transferable[] = []) =>
  (self as unknown as Worker).postMessage(msg, transfer)

self.onmessage = async (e: MessageEvent<Msg>) => {
  const msg = e.data
  try {
    if (msg.kind === 'exec') {
      const rows = await runExec(msg.sql, msg.params)
      post({ id: msg.id, ok: true, rows })
    } else if (msg.kind === 'export') {
      const d = await ready()
      const bytes: Uint8Array = sqlite3.capi.sqlite3_js_db_export(d)
      post({ id: msg.id, ok: true, bytes }, [bytes.buffer])
    } else {
      // import: close, overwrite the OPFS file, then reopen
      const d = await ready()
      d.close()
      db = undefined
      await sqlite3.oo1.OpfsDb.importDb(DB_NAME, msg.bytes)
      await ready()
      post({ id: msg.id, ok: true })
    }
  } catch (err) {
    post({ id: msg.id, ok: false, error: String(err) })
  }
}
