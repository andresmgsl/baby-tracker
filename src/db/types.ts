export type EntryType = 'breast' | 'bottle' | 'solids' | 'sleep' | 'diaper' | 'meds' | 'note'
export type Side = 'L' | 'R' | 'both'
export type DiaperKind = 'wet' | 'dirty' | 'both'
export type MilkType = 'breast' | 'formula'
export type MeasurementType = 'weight' | 'height' | 'head' | 'temperature'

export interface Entry {
  id: number
  type: EntryType
  start_ts: number
  end_ts: number | null
  side: Side | null
  amount_ml: number | null
  milk_type: MilkType | null
  food: string | null
  diaper_kind: DiaperKind | null
  med_name: string | null
  med_dose: string | null
  note: string | null
  photo_id: number | null
  created_at: number
  updated_at: number
}
export interface Measurement {
  id: number
  type: MeasurementType
  ts: number
  value: number
  note: string | null
  created_at: number
  updated_at: number
}
export interface ActiveTimer { type: 'breast' | 'sleep'; start_ts: number; side: Side | null }
export interface DailyTotals { feeds: number; diapers: number; sleepMs: number }
