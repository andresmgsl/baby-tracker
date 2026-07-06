import { ProfileSection } from './ProfileSection'
import { UnitsSection } from './UnitsSection'
import { BackupSection } from './BackupSection'
import { AccountSection } from './AccountSection'

export function Settings() {
  return (
    <div>
      <ProfileSection />
      <UnitsSection />
      <BackupSection />
      <AccountSection />
    </div>
  )
}
