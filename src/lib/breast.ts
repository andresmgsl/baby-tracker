import type { ActiveTimer, Side } from '../db/types'

export interface BreastTotals { left: number; right: number; total: number }

export function breastTotals(
  t: Pick<ActiveTimer, 'side' | 'left_ms' | 'right_ms' | 'running_since'>,
  now: number,
): BreastTotals {
  const runL = t.side === 'L' && t.running_since != null ? Math.max(0, now - t.running_since) : 0
  const runR = t.side === 'R' && t.running_since != null ? Math.max(0, now - t.running_since) : 0
  const left = t.left_ms + runL
  const right = t.right_ms + runR
  return { left, right, total: left + right }
}

export function deriveSide(left_ms: number, right_ms: number): Side {
  if (left_ms > 0 && right_ms > 0) return 'both'
  return right_ms > 0 ? 'R' : 'L'
}
