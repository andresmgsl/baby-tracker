# Baby Tracker (BabyLog)

A self-hosted PWA to track feeds, sleep, diapers, medications, notes, and growth
for one or more babies. A small Node server on your own box owns a single SQLite
database that can host **multiple families**: each login belongs to a family, a
family can track multiple babies (switchable from the sidebar), and every account
in the same family sees the **same shared log** — but families are fully isolated
from one another, enforced server-side on every request. Behind a login; installs
to the home screen.

## Features

- **Quick logging** — one tap to record breast/bottle feeds, sleep, diapers,
  solids, meds, temperature, measurements, and free-text notes.
- **Live timers** — running timers for breastfeeding and sleep, resumed across reloads.
- **Home timeline** — the last 3 days grouped by day (Today / Yesterday / date),
  plus today-only totals (feeds, nappies, sleep).
- **Filter chips** — tap activity-type icons to narrow the Home timeline (multi-select;
  none selected shows everything); "See all →" jumps to the full History archive.
- **History** — browse and edit past entries.
- **Growth** — weight/height/head-circumference measurements charted over time.
- **Multiple babies per family** — add babies from Settings → Manage Babies (with
  archive/restore); switch the active baby from the sidebar drawer, which is
  reflected across Home, History, Growth, and timers.
- **Families** — one server can host several families at once. Accounts are tagged
  with a family key; all data (babies, entries, settings) is scoped to that family
  and enforced on the server, so one family can never read or write another's data.
- **Shared data** — every account in a family sees the same entries for that
  family's babies.
- **Login** — fixed accounts (you + partner, plus any other families), scrypt-hashed,
  session-cookie auth.
- **Backup & restore** — export/import the whole database as a `.db` file, optionally
  restricted to a single admin family (see "Backup scope" below).
- **Installable** — full PWA; the app shell works offline (data needs the server).

## Tech stack

| Concern    | Choice |
|------------|--------|
| UI         | React 18 + TypeScript, Vite 6 |
| API server | Node.js (built-in `http`), no framework |
| Data       | SQLite via `better-sqlite3`, one file on the server |
| Auth       | scrypt password hashing + HMAC-signed httpOnly cookie (Node `crypto`) |
| PWA        | `vite-plugin-pwa` (Workbox) |
| Tests      | Vitest + Testing Library |

No external auth service, no ORM, and (besides `better-sqlite3`) no runtime npm
dependencies on the server — just Node built-ins.

## Architecture

Client and server are cleanly split by one interface. The React app talks to the
DB through a `SqlExecutor` (`exec(sql, params)` / `transaction`); in the browser
that's an **HTTP executor** that posts to the API, and the server runs the SQL
against the shared SQLite file.

```
React app (browser)
  └─ useDb() ─▶ makeHttpExecutor  (src/db/httpExecutor.ts)
                  │  POST /api/exec { sql, params }   (session cookie)
                  ▼
             Node API server      (server/)
                  ├─ auth: /api/login /logout /me   (server/auth.ts)
                  └─ better-sqlite3 ─▶ baby-tracker.sqlite3  (server/store.ts)
```

Because the query code (`src/db/queries.ts`) is written against the executor
interface, swapping the browser's storage engine for the network required **no
changes** to queries, components, or hooks.

### Layout

```
server/
├── index.ts        entry: load env, open store, listen
├── app.ts          http routing: auth + /api/exec /tx /export /import + static
├── auth.ts         scrypt hashing, signed session cookie, user table parsing
├── store.ts        better-sqlite3 wrapper (exec/transaction/serialize/replace)
└── env.ts          minimal .env loader
src/
├── auth/           AuthContext, Login screen, login gate (main.tsx)
├── db/             httpExecutor (client), client provider, schema, queries
├── components/     home / history / growth / settings screens
├── lib/            pure helpers: time, timer, totals, units, backup
└── styles/theme.css   dark neobrutalist design system
deploy/             nginx site, systemd unit, .env.example, DEPLOY.md
```

## Local development

Requires Node.js 18+ (developed on v26).

```bash
npm install

# one-time: create a local .env with a dev user
node scripts/hash-password.mjs andres devpass   # copy the printed line, then
                                                 # replace FAMILY with a family key
cat > .env <<EOF
PORT=8787
DB_PATH=./data/baby-tracker.sqlite3
SESSION_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
BT_USERS=andres:family=lopez:scrypt$...$...
EOF

npm run dev        # runs the API server + Vite together
```

Open http://localhost:5173 and sign in. Vite proxies `/api` to the API server on
`:8787`.

### Scripts

| Command                | What it does |
|------------------------|--------------|
| `npm run dev`          | API server + Vite dev server together |
| `npm run server`       | just the API server (watch mode) |
| `npm run dev:client`   | just Vite |
| `npm run build`        | type-check + build the client to `dist/` |
| `npm run build:server` | bundle the API server to `server-dist/index.mjs` |
| `npm start`            | run the bundled server (expects a real `.env`) |
| `npm run hash-password <name> <pw>` | print a `BT_USERS` entry |
| `npm run test`         | run the Vitest suite (client + server) |

## Deployment

See **[deploy/DEPLOY.md](deploy/DEPLOY.md)** for the full Raspberry Pi / nginx /
systemd / certbot walkthrough. In short: `npm run build && npm run build:server`,
fill in `.env` (secret + family-tagged hashed users), run the server via systemd,
and point an nginx vhost at `dist/` with `/api` proxied to the Node server over HTTPS.

## Data & privacy

- All data stays on your server — nothing goes to any third party.
- The database is a single SQLite file (`DB_PATH`) shared by every family; rows are
  scoped by family key and enforced server-side, so families can't see each other's
  babies or entries. Back the file up via Settings → Backup, or by copying it
  directly (see DEPLOY.md).
- Only the configured `BT_USERS` accounts can sign in. Always serve over HTTPS (the
  session cookie is `Secure` in production).

### Backup scope

Settings → Backup exports/imports the **entire** SQLite file — every family's data
at once. By default (no `ADMIN_FAMILY` set) any signed-in account can export or
import, which is fine for a single-family deployment but lets any family overwrite
the whole database, including other families' data. Once you host more than one
family on the same server, set `ADMIN_FAMILY=<key>` in `.env` to restrict
`/api/export` and `/api/import` to accounts in that one family; everyone else gets
a 403. There's no per-family export in this version — it's whole-database or
nothing.
