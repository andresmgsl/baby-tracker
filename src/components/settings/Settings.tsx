import { ProfileSection } from './ProfileSection'
import { UnitsSection } from './UnitsSection'
import { BackupSection } from './BackupSection'
import { InstallSection } from './InstallSection'
import { AccountSection } from './AccountSection'

export function Settings() {
  return (
    <div>
      <ProfileSection />
      <UnitsSection />
      <BackupSection />
      <InstallSection />
      <AccountSection />
    </div>
  )
}
