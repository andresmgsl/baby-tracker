import { describe, it, expect } from 'vitest'
import { makeTestExecutor } from './testExecutor'

describe('makeTestExecutor', () => {
  it('applies the schema and supports parameterized exec', async () => {
    const db = await makeTestExecutor()
    const tables = await db.exec(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
    )
    const names = tables.map((r) => r.name)
    expect(names).toEqual(
      expect.arrayContaining(['active_timer', 'entries', 'measurements', 'photos', 'settings']),
    )
    await db.exec('INSERT INTO settings (key, value) VALUES (?, ?)', ['units_weight', 'kg'])
    const rows = await db.exec('SELECT value FROM settings WHERE key = ?', ['units_weight'])
    expect(rows[0].value).toBe('kg')
    await db.close()
  })

  it('rolls back a failed transaction', async () => {
    const db = await makeTestExecutor()
    await expect(
      db.transaction(async (tx) => {
        await tx.exec('INSERT INTO settings (key, value) VALUES (?, ?)', ['a', '1'])
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')
    const rows = await db.exec('SELECT * FROM settings')
    expect(rows).toHaveLength(0)
    await db.close()
  })

  it('rejects nested transactions with a clear error', async () => {
    const db = await makeTestExecutor()
    await expect(
      db.transaction(async (tx) => {
        await tx.transaction(async () => {})
      }),
    ).rejects.toThrow('nested transactions not supported')
    // connection still usable after the rolled-back outer transaction
    await db.exec('INSERT INTO settings (key, value) VALUES (?, ?)', ['ok', '1'])
    expect((await db.exec('SELECT value FROM settings WHERE key = ?', ['ok']))[0].value).toBe('1')
    await db.close()
  })
})
