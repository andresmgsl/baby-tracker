import { createContext, createElement, useContext, useRef, type ReactNode } from 'react'
import type { Row } from './executor'
import { makeApiClient } from './httpExecutor'

/** DB access surface used across the app: named-query dispatch + backup export/import. */
export interface Api {
  q<T = Row[]>(name: string, args?: unknown): Promise<T>
  tx(ops: { name: string; args?: unknown }[]): Promise<Row[][]>
  exportBytes(): Promise<Uint8Array>
  importBytes(bytes: Uint8Array): Promise<void>
}

const DbContext = createContext<Api | null>(null)

export function DbProvider({ children, executor }: { children: ReactNode; executor?: Api }) {
  const ref = useRef<Api | null>(null)
  if (!ref.current) ref.current = executor ?? makeApiClient()
  return createElement(DbContext.Provider, { value: ref.current }, children)
}

export function useDb(): Api {
  const db = useContext(DbContext)
  if (!db) throw new Error('useDb must be used within <DbProvider>')
  return db
}
