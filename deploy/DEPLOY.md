# Deploying BabyLog to the Raspberry Pi

BabyLog is a small static web app (`dist/`) plus a Node API server (`server-dist/index.mjs`)
that owns one SQLite database. nginx serves the static files and reverse-proxies
`/api` to the Node server; TLS is terminated by nginx (certbot), same as Jellyfin.

Both parents share **one** database on the Pi — logging on one phone shows up on the other.

Assumes the repo lives at `/opt/baby-tracker` and the subdomain is `baby.abiqum.com`
(adjust paths/host to taste).

## 0. Prerequisites

```bash
node -v    # need 18+. If Debian's default is older, install current Node via
           # NodeSource or nvm, e.g.:
           #   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install -y nodejs

# better-sqlite3 compiles a native module on install — needs a toolchain:
sudo apt update && sudo apt install -y build-essential python3 git
```

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
npm ci                 # installs deps and compiles better-sqlite3 for the Pi's arch
```

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
# generate one line per user (the name on the left becomes the login username).
# each line prints as  name:family=FAMILY:scrypt$...  — replace FAMILY with a
# family key (accounts in the same family share the same babies & data):
npm run hash-password andres 'a-strong-password'   # -> put family=lopez
npm run hash-password wife   'her-strong-password'  # -> put family=lopez
```

Edit `.env`: paste the `SESSION_SECRET`, and set `BT_USERS` to the generated
entries (FAMILY replaced) joined by a comma (no spaces). Both parents of one
household share a family key; a second household gets a different key:

```
BT_USERS=andres:family=lopez:scrypt$...$...,wife:family=lopez:scrypt$...$...
DB_PATH=/opt/baby-tracker/data/baby-tracker.sqlite3
NODE_ENV=production
# Which family your existing (pre-families) data migrates onto on first boot.
# Defaults to the first family in BT_USERS; set explicitly to be safe:
LEGACY_FAMILY=lopez
# Optional: once more than one family shares this server, restrict whole-database
# backup export/import to accounts in this one family (others get 403):
# ADMIN_FAMILY=lopez
```

> **`BT_USERS` format:** `name:family=KEY:scrypt$salt$hash`, comma-separated.
> An entry without a `family=` tag is ignored (the server logs a warning and that
> user can't sign in), so every account must carry one.

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
sudo certbot --nginx -d baby.abiqum.com     # choose "redirect" (option 2) when asked
```

Open **https://baby.abiqum.com** → you should get the BABYLOG login. Sign in with
one of the accounts you created. Install it to your home screen (Add to Home Screen)
to use it like an app; repeat on the second phone with the other account.

> HTTPS is required: with `NODE_ENV=production` the session cookie is `Secure`, so
> login won't stick over plain http. That's intended — always use the https URL.

## 7. Managing users / resetting a password

Passwords are stored hashed (one-way), so a forgotten password can't be recovered —
you set a new one. To change a password, add a user, or remove one:

```bash
cd /opt/baby-tracker
npm run hash-password <name> '<new-password>'   # prints  name:family=FAMILY:scrypt$...
nano .env                                       # update the BT_USERS line (set the family key)
sudo systemctl restart baby-tracker
```

`BT_USERS` is the comma-separated list of `name:family=KEY:scrypt$...` entries (no
spaces). The names before the first `:` are the login usernames, and the
`family=KEY` segment groups accounts into a family — `grep '^BT_USERS' .env` to see
them. To add a whole new family, generate its users with a fresh family key.

## 8. Updating later

```bash
cd /opt/baby-tracker
git pull
npm ci
npm run build && npm run build:server
sudo systemctl restart baby-tracker
```

nginx serves the new `dist/` immediately. Most updates leave the database in
`data/` untouched.

> **Upgrading to the families / multi-baby release (one-time):** this release
> migrates the database **in place** on the first restart — it adds a `babies`
> table and attaches all existing entries/measurements to one baby under
> `LEGACY_FAMILY`. It is idempotent (safe to restart repeatedly), but do two
> things first:
> 1. **Back up** `data/baby-tracker.sqlite3` (see §9) before restarting.
> 2. **Convert `BT_USERS` to the family-tagged format** (`name:family=KEY:...`) —
>    the old `name:scrypt$...` format no longer authenticates, and set
>    `LEGACY_FAMILY` to the family your existing data should land under.
>
> After the restart the app opens on that family's migrated baby; add more babies
> in-app via **Settings → Babies**.

## 9. Backups

The entire history is the single file at `DB_PATH` — **every family's data in one
file**. Two ways to back it up:

- **In-app:** Settings → Backup → *Export database* downloads a `.db` snapshot; *Import*
  restores one. (These read/write the whole server database, all families at once.)
  On a multi-family server set `ADMIN_FAMILY=<key>` in `.env` so only that family can
  export/import — otherwise any signed-in account can overwrite everyone's data.
- **On the Pi:** copy the file, e.g. a nightly cron (`crontab -e`):
  ```bash
  0 3 * * *  mkdir -p "$HOME/backups" && cp /opt/baby-tracker/data/baby-tracker.sqlite3 "$HOME/backups/baby-$(date +\%F).sqlite3"
  ```

## PWA install (verify after deploy)

The browser only offers "Install app" on Android/desktop Chrome when the site is served
over HTTPS, the service worker registers, and the manifest points to **real** icons of at
least 192×192 and 512×512. After deploying, confirm the manifest and icons are reachable
and valid (a 404 or a tiny/placeholder icon silently suppresses the install prompt):

```bash
curl -sI https://baby.abiqum.com/manifest.webmanifest   # 200, application/manifest+json
curl -sI https://baby.abiqum.com/icon-192.png           # 200, image/png
curl -sI https://baby.abiqum.com/icon-512.png           # 200, image/png
# sanity-check the icon is a real bitmap, not a placeholder (bytes should be multi-KB):
curl -s https://baby.abiqum.com/icon-512.png | wc -c
```

On an Android phone, load the site, sign in, and the in-app **Install** banner should
appear (or Chrome's ⋮ menu shows *Install app*). On iPhone/Safari there is no automatic
prompt by design — use **Share → Add to Home Screen** (Settings → Install shows this hint).

## Troubleshooting

- `journalctl -u baby-tracker -f` — server logs. On boot it prints the db path and the
  loaded usernames; if it exits immediately, `SESSION_SECRET` or `BT_USERS` is missing.
- `status=127` / `env: 'node': No such file or directory` → nvm node not on systemd's
  PATH; see the note in step 5.
- Login returns 401 for a known-good password → the `BT_USERS` hash was generated with a
  different password, or an extra space crept into `.env`. Reset it (step 7).
- Login succeeds but immediately logs out → you're on `http://` not `https://` (Secure cookie).
- 403 in the browser after certbot → nginx (user `www-data`) can't read
  `/opt/baby-tracker/dist`; ensure the path is traversable/readable.
- 413 on database import → raise `client_max_body_size` in the nginx site.
- certbot "challenge failed" → ports 80/443 aren't reaching the Pi (router forwarding).
