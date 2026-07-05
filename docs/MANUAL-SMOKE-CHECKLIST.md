# Manual Smoke Checklist (PWA bits not covered by unit tests)

Run `npm run build && npm run preview`, open the preview URL on a real iPhone (Safari 17+).

> **Hosting requirement:** This app needs cross-origin isolation (the server must send `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`) for the OPFS SQLite database to open. The Vite dev server and `vite preview` are configured to send these headers; any production host (e.g. static hosting) must send them too, or the database will fail to open.

- [ ] Add to Home Screen → app icon appears, launches fullscreen (no Safari chrome).
- [ ] Log a bottle feed; confirm it appears in Home timeline and today's totals update.
- [ ] Start a breastfeed timer; lock the phone for 1 minute; reopen → banner shows ~1m elapsed.
- [ ] Stop the timer → a breast entry with correct duration is saved.
- [ ] Add a weight measurement in kg; switch units to lb in Settings → Growth shows lb/oz.
- [ ] Turn on Airplane Mode; force-quit and relaunch → app loads and all data is present.
- [ ] Settings → Export → a `babytracker-YYYY-MM-DD.db` file downloads.
- [ ] Settings → Import that file on a fresh browser profile → data restored.
- [ ] Edit an entry's time in History; delete an entry (confirm dialog) → list updates.
