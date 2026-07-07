import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { useDb } from '../db/client'
import { listBabies, type Baby } from '../db/queries'
import { setActiveBabyId } from '../db/activeBabyRef'

const STORAGE_KEY = 'bt.activeBaby'

export interface ActiveBaby {
  babies: Baby[]
  activeId: number | null
  active: Baby | null
  loading: boolean
  setActive(id: number): void
  reload(): Promise<void>
}

const Ctx = createContext<ActiveBaby | null>(null)

export function ActiveBabyProvider({ children }: { children: ReactNode }) {
  const db = useDb()
  const [babies, setBabies] = useState<Baby[]>([])
  const [activeId, setActiveId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  const apply = useCallback((id: number | null) => {
    setActiveId(id)
    setActiveBabyId(id)
    if (id == null) localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, String(id))
  }, [])

  const reload = useCallback(async () => {
    const list = await listBabies(db)
    setBabies(list)
    const saved = Number(localStorage.getItem(STORAGE_KEY))
    const keep = list.find((b) => b.id === saved) ?? list[0] ?? null
    apply(keep ? keep.id : null)
    setLoading(false)
  }, [db, apply])

  useEffect(() => { void reload() }, [reload])

  const setActive = useCallback((id: number) => { apply(id) }, [apply])
  const active = babies.find((b) => b.id === activeId) ?? null

  return <Ctx.Provider value={{ babies, activeId, active, loading, setActive, reload }}>{children}</Ctx.Provider>
}

export function useActiveBaby(): ActiveBaby {
  const v = useContext(Ctx)
  if (!v) throw new Error('useActiveBaby must be used within <ActiveBabyProvider>')
  return v
}
