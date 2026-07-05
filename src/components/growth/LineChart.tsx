import { chartGeometry } from './chartGeometry'

export function LineChart({
  points, width = 320, height = 180,
}: {
  points: { x: number; y: number }[]
  width?: number
  height?: number
}) {
  const { path, dots } = chartGeometry(points, width, height, 16)
  if (points.length === 0) return <p className="muted">No measurements yet.</p>
  return (
    <svg className="chart" viewBox={`0 0 ${width} ${height}`} width="100%">
      {path && <path d={path} fill="none" stroke="var(--accent)" strokeWidth={2} />}
      {dots.map((d, i) => (
        <circle key={i} cx={d.cx} cy={d.cy} r={i === dots.length - 1 ? 5 : 3} fill="var(--accent)" />
      ))}
    </svg>
  )
}
