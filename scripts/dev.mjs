#!/usr/bin/env node
// Dev orchestrator: runs the API server (with live TS via Node type-stripping)
// and the Vite dev server together. Vite proxies /api -> the API (see vite.config.ts).
import { spawn } from 'node:child_process'

const procs = [
  spawn('node', ['--experimental-strip-types', '--watch', 'server/index.ts'],
    { stdio: 'inherit', env: process.env }),
  spawn('npx', ['vite'], { stdio: 'inherit', env: process.env }),
]

const shutdown = () => { for (const p of procs) p.kill('SIGTERM') }
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
for (const p of procs) p.on('exit', (code) => { if (code) { shutdown(); process.exit(code ?? 1) } })
