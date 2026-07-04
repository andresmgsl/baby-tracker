import { useCallback, useEffect, useState } from 'react'
import { useDb } from '../db/client'
import { listEntriesBetween } from '../db/queries'
import type { Entry } from '../db/types'

export function useEntries(fromTs: number, toTs: number) {
  const db = useDb()
  const [entries, setEntries] = useState<Entry[]>([])
  const reload = useCallback(async () => {
    setEntries(await listEntriesBetween(db, fromTs, toTs))
  }, [db, fromTs, toTs])
  useEffect(() => { void reload() }, [reload])
  return { entries, reload }
}
