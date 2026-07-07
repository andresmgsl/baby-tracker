import { openStore } from './store.ts'
import { createServer } from './app.ts'
import { parseUsers } from './auth.ts'
import { loadEnv } from './env.ts'

loadEnv()

const port = Number(process.env.PORT ?? 8787)
const dbPath = process.env.DB_PATH ?? './data/baby-tracker.sqlite3'
const secret = process.env.SESSION_SECRET
const users = parseUsers(process.env.BT_USERS)
const staticDir = process.env.STATIC_DIR || undefined // e.g. ./dist in production
const legacyFamily = process.env.LEGACY_FAMILY
  || [...users.values()][0]?.family
  || 'family'
const adminFamily = process.env.ADMIN_FAMILY || undefined

if (!secret) {
  console.error('FATAL: SESSION_SECRET is not set. Copy deploy/.env.example to .env and fill it in.')
  process.exit(1)
}
if (users.size === 0) {
  console.error('FATAL: BT_USERS is empty. Generate entries with `npm run hash-password <name> <password>`.')
  process.exit(1)
}

const store = openStore(dbPath, legacyFamily)
const server = createServer({
  store,
  users,
  secret,
  secureCookies: process.env.NODE_ENV === 'production',
  staticDir,
  adminFamily,
})

server.listen(port, () => {
  console.log(`baby-tracker api listening on :${port}`)
  console.log(`  db: ${dbPath}`)
  console.log(`  users: ${[...users.keys()].join(', ')}`)
  if (staticDir) console.log(`  serving static from: ${staticDir}`)
})

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => { server.close(() => { store.close(); process.exit(0) }) })
}
