import { useActiveBaby } from '../../state/ActiveBabyContext'

export function BabySwitcher({ open, onClose, onManage }: { open: boolean; onClose(): void; onManage(): void }) {
  const { babies, activeId, setActive } = useActiveBaby()
  if (!open) return null
  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="baby-drawer" onClick={(e) => e.stopPropagation()}>
        <h3>Babies</h3>
        <ul className="baby-list">
          {babies.map((b) => (
            <li key={b.id}>
              <button
                className={b.id === activeId ? 'baby-item active' : 'baby-item'}
                onClick={() => { setActive(b.id); onClose() }}
              >{b.name}</button>
            </li>
          ))}
        </ul>
        <button className="btn-link" onClick={onManage}>Manage babies</button>
      </aside>
    </div>
  )
}
