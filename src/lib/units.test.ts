import { describe, it, expect } from 'vitest'
import { gToKg, kgToG, gToLbOz, mmToCm, cmToMm, mmToIn, inToMm, cToF, fToC, round1 } from './units'

describe('weight', () => {
  it('converts grams <-> kg', () => {
    expect(gToKg(5200)).toBe(5.2)
    expect(kgToG(5.2)).toBe(5200)
  })
  it('converts grams -> lb/oz', () => {
    expect(gToLbOz(3500)).toEqual({ lb: 7, oz: 11 })
  })
})

describe('length', () => {
  it('converts mm <-> cm and mm -> in', () => {
    expect(mmToCm(620)).toBe(62)
    expect(cmToMm(62)).toBe(620)
    expect(round1(mmToIn(254))).toBe(10)
    expect(Math.round(inToMm(10))).toBe(254)
  })
})

describe('temperature', () => {
  it('converts C <-> F', () => {
    expect(cToF(37)).toBe(98.6)
    expect(round1(fToC(98.6))).toBe(37)
  })
})
