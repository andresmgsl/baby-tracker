export type Row = Record<string, unknown>

export interface SqlExecutor {
  exec(sql: string, params?: unknown[]): Promise<Row[]>
  transaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T>
  close(): Promise<void>
}
