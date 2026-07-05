const pad = (n: number) => String(n).padStart(2, '0')

export function exportFilename(now: number): string {
  const d = new Date(now)
  return `babytracker-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.db`
}

export function downloadBytes(bytes: Uint8Array, filename: string): void {
  const blob = new Blob([bytes as unknown as BlobPart], { type: 'application/x-sqlite3' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export async function readFileBytes(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer())
}
