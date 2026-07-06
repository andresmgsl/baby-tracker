import { usePwaInstall } from '../../lib/pwaInstall'

export function InstallSection() {
  const { canInstall, isIOS, isInstalled, promptInstall } = usePwaInstall()

  if (isInstalled) {
    return (
      <section className="card-section">
        <h3>Install</h3>
        <p className="muted">App is installed. ✓</p>
      </section>
    )
  }

  return (
    <section className="card-section">
      <h3>Install</h3>
      {canInstall ? (
        <button className="btn-primary" onClick={() => void promptInstall()}>Install app</button>
      ) : isIOS ? (
        <p className="muted">Tap the Share button, then “Add to Home Screen”.</p>
      ) : (
        <p className="muted">Open this site in Chrome or Edge to install, or use your browser’s “Install app” menu.</p>
      )}
    </section>
  )
}
