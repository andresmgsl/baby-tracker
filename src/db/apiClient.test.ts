import { afterEach, expect, test, vi } from 'vitest'
import { makeApiClient } from './httpExecutor'
import { setActiveBabyId } from './activeBabyRef'

afterEach(() => vi.restoreAllMocks())

test('q posts to /api/q with X-Baby-Id header from active baby', async () => {
  setActiveBabyId(42)
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ rows: [{ id: 1 }] }), { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
  const api = makeApiClient()
  const rows = await api.q('insertEntry', { type: 'sleep', start_ts: 1 })
  expect(rows).toEqual([{ id: 1 }])
  const [path, init] = fetchMock.mock.calls[0]
  expect(path).toBe('/api/q')
  expect((init as RequestInit).method).toBe('POST')
  expect(new Headers((init as RequestInit).headers).get('X-Baby-Id')).toBe('42')
  expect(JSON.parse((init as RequestInit).body as string)).toEqual({ name: 'insertEntry', args: { type: 'sleep', start_ts: 1 } })
})
