import { useState } from 'react'
import { usePwaInstall } from '../../lib/pwaInstall'

const DISMISS_KEY = 'bt_install_dismissed'

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1'
  } catch {
    return false
  }
}

function writeDismissed(): void {
  try {
    localStorage.setItem(DISMISS_KEY, '1')
  } catch {
    // Storage unavailable (e.g. private mode / restricted webview); fall back to session-only dismissal.
  }
}

export function InstallBanner() {
  const { canInstall, promptInstall } = usePwaInstall()
  const [dismissed, setDismissed] = useState(() => readDismissed())

  if (!canInstall || dismissed) return null

  function dismiss() {
    writeDismissed()
    setDismissed(true)
  }

  return (
    <div className="install-banner">
      <span>Install BabyLog for one-tap access.</span>
      <div className="install-banner-actions">
        <button className="btn-primary" onClick={() => void promptInstall()}>Install</button>
        <button className="btn-link" aria-label="Dismiss" onClick={dismiss}>✕</button>
      </div>
    </div>
  )
}
