import { useState, type FormEvent } from 'react'
import { useAuth } from './AuthContext'

export function Login() {
  const { login } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const err = await login(username.trim(), password)
    setBusy(false)
    if (err) setError(err)
  }

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={onSubmit}>
        <header className="login-brand">
          <div className="login-word">
            <span className="login-logo" aria-hidden="true" />
            BABY<i>LOG</i>
          </div>
          <p className="login-tag">For the 3am shift</p>
        </header>
        <div className="login-fields">
          <label className="login-label" htmlFor="login-user">Name</label>
          <input
            id="login-user" className="text-input" autoComplete="username" autoCapitalize="none"
            value={username} onChange={(e) => setUsername(e.target.value)} required
          />
          <label className="login-label" htmlFor="login-pass">Password</label>
          <input
            id="login-pass" className="text-input" type="password" autoComplete="current-password"
            value={password} onChange={(e) => setPassword(e.target.value)} required
          />
          {error && <p className="login-error" role="alert">{error}</p>}
          <button className="btn-primary" type="submit" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </div>
      </form>
    </div>
  )
}
