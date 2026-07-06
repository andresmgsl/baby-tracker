# Baby Tracker (BabyLog)

A self-hosted PWA for two parents to track one baby's feeds, sleep, diapers,
medications, notes, and growth. A small Node server on your own box owns a single
SQLite database, so both parents see the **same shared log**. Behind a login;
installs to the home screen.

## Features

- **Quick logging** — one tap to record breast/bottle feeds, sleep, diapers,
  solids, meds, temperature, measurements, and free-text notes.
- **Live timers** — running timers for breastfeeding and sleep, resumed across reloads.
- **Today view** — a running timeline plus daily totals (feeds, nappies, sleep).
- **History** — browse and edit past entries.
- **Growth** — weight/height/head-circumference measurements charted over time.
- **Shared data** — one database on the server; both accounts see the same entries.
- **Login** — two fixed accounts (you + partner), scrypt-hashed, session-cookie auth.
- **Backup & restore** — export/import the whole database as a `.db` file.
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
node scripts/hash-password.mjs andres devpass   # copy the printed line
cat > .env <<EOF
PORT=8787
DB_PATH=./data/baby-tracker.sqlite3
SESSION_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
BT_USERS=<paste the hash-password line here>
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
fill in `.env` (secret + two hashed users), run the server via systemd, and point
an nginx vhost at `dist/` with `/api` proxied to the Node server over HTTPS.

## Data & privacy

- All data stays on your server — nothing goes to any third party.
- The database is a single SQLite file (`DB_PATH`). Back it up via Settings →
  Backup, or by copying the file (see DEPLOY.md).
- Only the two configured accounts can sign in. Always serve over HTTPS (the
  session cookie is `Secure` in production).
