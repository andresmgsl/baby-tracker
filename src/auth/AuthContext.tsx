import {
  createContext, useContext, useEffect, useState, useCallback, type ReactNode,
} from 'react'
import { UNAUTHORIZED_EVENT } from '../db/httpExecutor'

interface Auth {
  user: string | null
  loading: boolean
  login(username: string, password: string): Promise<string | null> // returns error message or null
  logout(): Promise<void>
}

const AuthContext = createContext<Auth | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void fetch('/api/me', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => setUser(b?.user ?? null))
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    const drop = () => setUser(null)
    window.addEventListener(UNAUTHORIZED_EVENT, drop)
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, drop)
  }, [])

  const login = useCallback(async (username: string, password: string) => {
    try {
      const res = await fetch('/api/login', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      if (res.ok) { setUser((await res.json()).user); return null }
      const body = await res.json().catch(() => ({}))
      return body.error || 'Sign in failed.'
    } catch {
      return 'Can’t reach the server.'
    }
  }, [])

  const logout = useCallback(async () => {
    await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => {})
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): Auth {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>')
  return ctx
}
