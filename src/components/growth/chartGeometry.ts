export function chartGeometry(
  points: { x: number; y: number }[],
  width: number,
  height: number,
  pad: number,
): { path: string; dots: { cx: number; cy: number }[] } {
  if (points.length === 0) return { path: '', dots: [] }
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const minX = Math.min(...xs), maxX = Math.max(...xs)
  const minY = Math.min(...ys), maxY = Math.max(...ys)
  const spanX = maxX - minX || 1
  const spanY = maxY - minY || 1
  const innerW = width - pad * 2
  const innerH = height - pad * 2
  const dots = points.map((p) => ({
    cx: pad + (points.length === 1 ? 0 : ((p.x - minX) / spanX) * innerW),
    cy: points.length === 1 ? height / 2 : pad + innerH - ((p.y - minY) / spanY) * innerH,
  }))
  const path = dots
    .map((d, i) => `${i === 0 ? 'M' : 'L'} ${d.cx} ${d.cy}`)
    .join(' ')
  return { path, dots }
}
