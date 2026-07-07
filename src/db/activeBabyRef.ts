// Module-level mirror of the active baby id so non-React callers (the Api client)
// can stamp the X-Baby-Id header. Kept in sync by ActiveBabyProvider (Task 12).
let activeBabyId: number | null = null
export function setActiveBabyId(id: number | null): void { activeBabyId = id }
export function getActiveBabyId(): number | null { return activeBabyId }
