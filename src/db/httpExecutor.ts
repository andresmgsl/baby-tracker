import type { Row } from './executor'
import type { WorkerExecutor } from './client'

/** Thrown when the API rejects a request for lack of a valid session. */
export class UnauthorizedError extends Error {
  constructor() { super('Not signed in') }
}

/** Fired on any 401 so the auth gate can drop back to the login screen. */
export const UNAUTHORIZED_EVENT = 'bt:unauthorized'

async function api(path: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(`/api${path}`, { credentials: 'same-origin', ...init })
  if (res.status === 401) {
    window.dispatchEvent(new Event(UNAUTHORIZED_EVENT))
    throw new UnauthorizedError()
  }
  if (!res.ok) {
    const msg = await res.json().then((b) => b?.error).catch(() => null)
    throw new Error(msg || `Request failed (${res.status})`)
  }
  return res
}

const JSON_HEADERS = { 'Content-Type': 'application/json' }

/**
 * Talks to the shared server DB over HTTP. Implements the same interface the
 * app used for the in-browser SQLite worker, so no query/component code changes.
 */
export function makeHttpExecutor(): WorkerExecutor {
  const exec = async (sql: string, params: unknown[] = []): Promise<Row[]> => {
    const res = await api('/exec', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ sql, params }) })
    const { rows } = await res.json()
    return rows as Row[]
  }

  // The app never opens a transaction at runtime (verified); statements run
  // sequentially against the shared connection. Kept for interface parity.
  const txExecutor: WorkerExecutor = {
    exec,
    transaction: (fn) => fn(txExecutor),
    close: async () => {},
    exportBytes: async () => new Uint8Array(),
    importBytes: async () => {},
  }

  return {
    exec,
    async transaction(fn) { return fn(txExecutor) },
    async close() {},
    async exportBytes() {
      const res = await api('/export', { method: 'GET' })
      return new Uint8Array(await res.arrayBuffer())
    },
    async importBytes(bytes: Uint8Array) {
      await api('/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: new Blob([bytes as unknown as BlobPart]),
      })
    },
  }
}
