import { ProfileSection } from './ProfileSection'
import { UnitsSection } from './UnitsSection'
import { BackupSection } from './BackupSection'

export function Settings() {
  return (
    <div>
      <ProfileSection />
      <UnitsSection />
      <BackupSection />
    </div>
  )
}
