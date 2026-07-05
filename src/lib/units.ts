export const round1 = (n: number): number => Math.round(n * 10) / 10

export const gToKg = (g: number): number => round1(g / 1000)
export const kgToG = (kg: number): number => Math.round(kg * 1000)

export function gToLbOz(g: number): { lb: number; oz: number } {
  const totalOz = g / 28.349523125
  const lb = Math.floor(totalOz / 16)
  const oz = Math.round(totalOz - lb * 16)
  return oz === 16 ? { lb: lb + 1, oz: 0 } : { lb, oz }
}

export const mmToCm = (mm: number): number => round1(mm / 10)
export const cmToMm = (cm: number): number => Math.round(cm * 10)
export const mmToIn = (mm: number): number => mm / 25.4
export const inToMm = (inch: number): number => inch * 25.4

export const cToF = (c: number): number => round1(c * 9 / 5 + 32)
export const fToC = (f: number): number => ((f - 32) * 5) / 9
