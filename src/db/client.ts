import { createContext, createElement, useContext, useRef, type ReactNode } from 'react'
import type { SqlExecutor } from './executor'
import { makeHttpExecutor } from './httpExecutor'

/** DB access surface used across the app (queries + backup export/import). */
export interface WorkerExecutor extends SqlExecutor {
  exportBytes(): Promise<Uint8Array>
  importBytes(bytes: Uint8Array): Promise<void>
}

const DbContext = createContext<WorkerExecutor | null>(null)

export function DbProvider({ children, executor }: { children: ReactNode; executor?: WorkerExecutor }) {
  const ref = useRef<WorkerExecutor | null>(null)
  if (!ref.current) ref.current = executor ?? makeHttpExecutor()
  return createElement(DbContext.Provider, { value: ref.current }, children)
}

export function useDb(): WorkerExecutor {
  const db = useContext(DbContext)
  if (!db) throw new Error('useDb must be used within <DbProvider>')
  return db
}
