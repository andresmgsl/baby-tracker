import { useState } from 'react'
import { usePwaInstall } from '../../lib/pwaInstall'

const DISMISS_KEY = 'bt_install_dismissed'

export function InstallBanner() {
  const { canInstall, promptInstall } = usePwaInstall()
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISS_KEY) === '1')

  if (!canInstall || dismissed) return null

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, '1')
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
