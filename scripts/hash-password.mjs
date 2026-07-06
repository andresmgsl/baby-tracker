#!/usr/bin/env node
// Generate a BT_USERS entry: node scripts/hash-password.mjs <username> <password>
// Prints  username:scrypt$<salt>$<hash>  — append to BT_USERS in your .env (comma-separated).
import { scryptSync, randomBytes } from 'node:crypto'

const [username, password] = process.argv.slice(2)
if (!username || !password) {
  console.error('Usage: node scripts/hash-password.mjs <username> <password>')
  process.exit(1)
}
const salt = randomBytes(16)
const key = scryptSync(password, salt, 64)
const stored = `scrypt$${salt.toString('base64')}$${key.toString('base64')}`
console.log(`${username}:${stored}`)
