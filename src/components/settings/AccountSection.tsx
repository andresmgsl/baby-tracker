import { useAuth } from '../../auth/AuthContext'

export function AccountSection() {
  const { user, logout } = useAuth()
  return (
    <section className="card-section">
      <h3>Account</h3>
      <p className="muted">Signed in as <strong>{user}</strong></p>
      <button className="btn-ghost" style={{ marginTop: 10 }} onClick={() => void logout()}>
        Sign out
      </button>
    </section>
  )
}
