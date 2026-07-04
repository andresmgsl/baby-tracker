import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { DbProvider } from './db/client'
import './styles/theme.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DbProvider>
      <App />
    </DbProvider>
  </StrictMode>,
)
