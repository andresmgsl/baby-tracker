import { describe, it, expect } from 'vitest'
import { chartGeometry } from './chartGeometry'

describe('chartGeometry', () => {
  it('maps points into padded SVG space with y inverted', () => {
    const { path, dots } = chartGeometry(
      [{ x: 0, y: 0 }, { x: 10, y: 10 }], 100, 100, 10,
    )
    // x: 0->pad(10), 10->width-pad(90); y inverted: 0->height-pad(90), 10->pad(10)
    expect(dots).toEqual([{ cx: 10, cy: 90 }, { cx: 90, cy: 10 }])
    expect(path).toBe('M 10 90 L 90 10')
  })

  it('handles a single point (flat line at vertical center)', () => {
    const { dots } = chartGeometry([{ x: 5, y: 5 }], 100, 100, 10)
    expect(dots).toHaveLength(1)
    expect(dots[0].cx).toBe(10)
    expect(dots[0].cy).toBe(50)
  })
})
