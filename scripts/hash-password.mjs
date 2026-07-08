#!/usr/bin/env node
// Generate a BT_USERS entry: node scripts/hash-password.mjs <username> <password>
// Prints  username:family=FAMILY:scrypt$<salt>$<hash>  — append to BT_USERS in your
// .env (comma-separated). Replace FAMILY with the family key this user belongs to
// (accounts sharing a family key share the same data).
import { scryptSync, randomBytes } from 'node:crypto'

const [username, password] = process.argv.slice(2)
if (!username || !password) {
  console.error('Usage: node scripts/hash-password.mjs <username> <password>')
  process.exit(1)
}
const salt = randomBytes(16)
const key = scryptSync(password, salt, 64)
const stored = `scrypt$${salt.toString('base64')}$${key.toString('base64')}`
console.log(`${username}:family=FAMILY:${stored}`)
console.log('(replace FAMILY above with this user\'s family key before pasting into BT_USERS)')
