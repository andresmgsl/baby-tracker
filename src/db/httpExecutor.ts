import { getActiveBabyId } from './activeBabyRef'
import type { Api } from './client'

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

function babyHeaders(): Record<string, string> {
  const id = getActiveBabyId()
  return id == null ? { ...JSON_HEADERS } : { ...JSON_HEADERS, 'X-Baby-Id': String(id) }
}

/**
 * Talks to the shared server DB over HTTP via named-query dispatch (/api/q, /api/qtx),
 * stamping the active baby id on every request so the server can scope access.
 */
export function makeApiClient(): Api {
  return {
    async q(name, args = {}) {
      const res = await api('/q', { method: 'POST', headers: babyHeaders(), body: JSON.stringify({ name, args }) })
      const { rows } = await res.json()
      return rows
    },
    async tx(ops) {
      const res = await api('/qtx', { method: 'POST', headers: babyHeaders(), body: JSON.stringify({ ops }) })
      const { results } = await res.json()
      return results
    },
    async exportBytes() {
      const res = await api('/export', { method: 'GET' })
      return new Uint8Array(await res.arrayBuffer())
    },
    async importBytes(bytes: Uint8Array) {
      await api('/import', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: new Blob([bytes as unknown as BlobPart]) })
    },
  }
}
