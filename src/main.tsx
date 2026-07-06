import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { DbProvider } from './db/client'
import { AuthProvider, useAuth } from './auth/AuthContext'
import { Login } from './auth/Login'
import './styles/theme.css'
import './pwa'

function Gate() {
  const { user, loading } = useAuth()
  if (loading) return <div className="login-screen"><div className="login-splash">BABYLOG</div></div>
  if (!user) return <Login />
  return (
    <DbProvider>
      <App />
    </DbProvider>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <Gate />
    </AuthProvider>
  </StrictMode>,
)
