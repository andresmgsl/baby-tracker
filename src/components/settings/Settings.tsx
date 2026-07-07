import { BabiesSection } from './BabiesSection'
import { UnitsSection } from './UnitsSection'
import { BackupSection } from './BackupSection'
import { InstallSection } from './InstallSection'
import { AccountSection } from './AccountSection'

export function Settings() {
  return (
    <div>
      <BabiesSection />
      <UnitsSection />
      <BackupSection />
      <InstallSection />
      <AccountSection />
    </div>
  )
}
