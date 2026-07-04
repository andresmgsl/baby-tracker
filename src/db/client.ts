import { createContext, createElement, useContext, useRef, type ReactNode } from 'react'
import type { SqlExecutor, Row } from './executor'

export interface WorkerExecutor extends SqlExecutor {
  exportBytes(): Promise<Uint8Array>
  importBytes(bytes: Uint8Array): Promise<void>
}

export function makeWorkerExecutor(): WorkerExecutor {
  const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
  let seq = 0
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pending = new Map<number, { resolve: (v: any) => void; reject: (e: any) => void }>()

  worker.onmessage = (e: MessageEvent) => {
    const { id, ok, rows, bytes, error } = e.data
    const p = pending.get(id)
    if (!p) return
    pending.delete(id)
    if (ok) p.resolve({ rows, bytes })
    else p.reject(new Error(error))
  }

  const send = (payload: Record<string, unknown>, transfer: Transferable[] = []) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    new Promise<any>((resolve, reject) => {
      const id = ++seq
      pending.set(id, { resolve, reject })
      worker.postMessage({ id, ...payload }, transfer)
    })

  const exec = async (sql: string, params: unknown[] = []): Promise<Row[]> => {
    const { rows } = await send({ kind: 'exec', sql, params })
    return rows as Row[]
  }

  const self: WorkerExecutor = {
    exec,
    async transaction(fn) {
      await exec('BEGIN')
      try {
        const result = await fn({
          exec,
          transaction: (f) => f(self),
          close: async () => {},
        })
        await exec('COMMIT')
        return result
      } catch (err) {
        await exec('ROLLBACK')
        throw err
      }
    },
    async close() {
      worker.terminate()
    },
    async exportBytes() {
      const { bytes } = await send({ kind: 'export' })
      return bytes as Uint8Array
    },
    async importBytes(bytes: Uint8Array) {
      await send({ kind: 'import', bytes }, [bytes.buffer])
    },
  }
  return self
}

const DbContext = createContext<WorkerExecutor | null>(null)

export function DbProvider({ children, executor }: { children: ReactNode; executor?: WorkerExecutor }) {
  const ref = useRef<WorkerExecutor | null>(null)
  if (!ref.current) ref.current = executor ?? makeWorkerExecutor()
  return createElement(DbContext.Provider, { value: ref.current }, children)
}

export function useDb(): WorkerExecutor {
  const db = useContext(DbContext)
  if (!db) throw new Error('useDb must be used within <DbProvider>')
  return db
}
