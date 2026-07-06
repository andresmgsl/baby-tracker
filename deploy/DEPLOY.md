# Deploying BabyLog to the Raspberry Pi

BabyLog is a small static web app (`dist/`) plus a Node API server (`server-dist/index.mjs`)
that owns one SQLite database. nginx serves the static files and reverse-proxies
`/api` to the Node server; TLS is terminated by nginx (certbot), same as Jellyfin.

Both parents share **one** database on the Pi — logging on one phone shows up on the other.

Assumes the repo lives at `/opt/baby-tracker` and the subdomain is `baby.abiqum.com`
(adjust paths/host to taste).

## 1. DNS

Already set: a `CNAME` record `baby` → `smallserver.asuscomm.com` (your ASUS router's
DDNS), so `baby.abiqum.com` resolves to the Pi's network — the same path Jellyfin uses.
Make sure ports 80 and 443 are forwarded to the Pi so certbot's challenge can reach it,
then confirm it resolves before continuing:

```bash
dig +short baby.abiqum.com     # should chain to smallserver.asuscomm.com -> your IP
```

## 2. Get the code onto the Pi

```bash
sudo mkdir -p /opt/baby-tracker && sudo chown "$USER" /opt/baby-tracker
git clone <your-repo-url> /opt/baby-tracker
cd /opt/baby-tracker
npm ci                 # installs deps and builds better-sqlite3 for the Pi's arch
```

Requires Node.js 18+ (`node -v`). If Debian's default is older, install a current
Node (e.g. via nodesource or nvm).

## 3. Build

```bash
npm run build          # client -> dist/
npm run build:server   # API   -> server-dist/index.mjs
mkdir -p data          # where the database file will live
```

## 4. Configure secrets

```bash
cp deploy/.env.example .env
# generate a session secret:
node -e "console.log('SESSION_SECRET='+require('crypto').randomBytes(32).toString('hex'))"
# generate one line per user:
npm run hash-password andres 'a-strong-password'
npm run hash-password wife   'her-strong-password'
```

Edit `.env`: paste the `SESSION_SECRET`, and set `BT_USERS` to both generated
entries joined by a comma (no spaces):

```
BT_USERS=andres:scrypt$...$...,wife:scrypt$...$...
DB_PATH=/opt/baby-tracker/data/baby-tracker.sqlite3
NODE_ENV=production
```

## 5. Run the API as a service

```bash
sudo cp deploy/baby-tracker.service /etc/systemd/system/
# Run as your user:
sudo sed -i "s|^User=.*|User=$USER|" /etc/systemd/system/baby-tracker.service
sudo systemctl daemon-reload
sudo systemctl enable --now baby-tracker
systemctl status baby-tracker         # should be active (running)
curl -s localhost:8787/api/me         # -> {"error":"Not signed in."}  (good: it's up)
```

> **If it exits with `status=127` / `env: 'node': No such file or directory`:** node
> isn't on systemd's PATH (typical when node was installed via **nvm**, under your home
> dir). Point ExecStart at node's absolute path:
> ```bash
> sudo sed -i "s|^ExecStart=.*|ExecStart=$(which node) server-dist/index.mjs|" \
>   /etc/systemd/system/baby-tracker.service
> sudo systemctl daemon-reload && sudo systemctl restart baby-tracker
> ```
> Make sure `User=` is the user that owns that nvm install.

## 6. nginx + HTTPS

```bash
sudo cp deploy/nginx-baby.abiqum.com.conf /etc/nginx/sites-available/baby.abiqum.com
sudo ln -s /etc/nginx/sites-available/baby.abiqum.com /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d baby.abiqum.com     # adds the :443 block + redirect
```

Open **https://baby.abiqum.com** → you should get the BABYLOG login. Sign in with
one of the accounts you created. Install it to your home screen (Add to Home Screen)
to use it like an app.

> HTTPS is required: with `NODE_ENV=production` the session cookie is `Secure`, so
> login won't stick over plain http. That's intended — always use the https URL.

## 7. Updating later

```bash
cd /opt/baby-tracker
git pull
npm ci
npm run build && npm run build:server
sudo systemctl restart baby-tracker
```

nginx serves the new `dist/` immediately. The database in `data/` is untouched by updates.

## 8. Backups

The entire history is the single file at `DB_PATH`. Two ways to back it up:

- **In-app:** Settings → Backup → *Export database* downloads a `.db` snapshot; *Import*
  restores one. (These now read/write the server database.)
- **On the Pi:** copy the file, e.g. a nightly cron:
  ```bash
  0 3 * * *  cp /opt/baby-tracker/data/baby-tracker.sqlite3 /home/pi/backups/baby-$(date +\%F).sqlite3
  ```

## Troubleshooting

- `journalctl -u baby-tracker -f` — server logs. On boot it prints the db path and the
  loaded usernames; if it exits immediately, `SESSION_SECRET` or `BT_USERS` is missing.
- Login returns 401 for a known-good password → the `BT_USERS` hash was generated with a
  different password, or an extra space crept into `.env`.
- Login succeeds but immediately logs out → you're on `http://` not `https://` (Secure cookie).
- 413 on database import → raise `client_max_body_size` in the nginx site.
