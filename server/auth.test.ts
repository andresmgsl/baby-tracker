// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  hashPassword, verifyPassword, parseUsers, signSession, verifySession, parseCookies,
} from './auth'

describe('password hashing', () => {
  it('verifies a correct password and rejects a wrong one', () => {
    const stored = hashPassword('correct horse')
    expect(verifyPassword('correct horse', stored)).toBe(true)
    expect(verifyPassword('wrong', stored)).toBe(false)
  })
  it('produces a distinct salt each time', () => {
    expect(hashPassword('x')).not.toBe(hashPassword('x'))
  })
  it('rejects malformed stored values', () => {
    expect(verifyPassword('x', 'garbage')).toBe(false)
    expect(verifyPassword('x', '')).toBe(false)
  })
})

describe('parseUsers', () => {
  it('parses multiple users with hash values containing $', () => {
    const users = parseUsers('alice:family=fam1:scrypt$AAAA$BBBB,bob:family=fam2:scrypt$CCCC$DDDD')
    expect(users.get('alice')).toEqual({ family: 'fam1', hash: 'scrypt$AAAA$BBBB' })
    expect(users.get('bob')).toEqual({ family: 'fam2', hash: 'scrypt$CCCC$DDDD' })
    expect(users.size).toBe(2)
  })
  it('returns empty map for undefined/blank', () => {
    expect(parseUsers(undefined).size).toBe(0)
    expect(parseUsers('  ').size).toBe(0)
  })
})

describe('session token', () => {
  const secret = 'test-secret'
  it('round-trips a username', () => {
    const token = signSession('alice', secret)
    expect(verifySession(token, secret)).toBe('alice')
  })
  it('rejects a tampered payload', () => {
    const token = signSession('alice', secret)
    const forged = signSession('mallory', secret).split('.')[0] + '.' + token.split('.')[1]
    expect(verifySession(forged, secret)).toBeNull()
  })
  it('rejects a wrong secret', () => {
    expect(verifySession(signSession('alice', secret), 'other')).toBeNull()
  })
  it('rejects an expired token', () => {
    const now = 1_000_000
    const token = signSession('alice', secret, 1000, now)
    expect(verifySession(token, secret, now + 2000)).toBeNull()
    expect(verifySession(token, secret, now + 500)).toBe('alice')
  })
  it('rejects undefined/garbage', () => {
    expect(verifySession(undefined, secret)).toBeNull()
    expect(verifySession('nodot', secret)).toBeNull()
  })
})

test('parseUsers extracts family tag and hash', () => {
  const raw = 'andres:family=lopez:scrypt$c2FsdA==$aGFzaA==,mara:family=nunez:scrypt$c2E=$aA=='
  const users = parseUsers(raw)
  expect(users.get('andres')).toEqual({ family: 'lopez', hash: 'scrypt$c2FsdA==$aGFzaA==' })
  expect(users.get('mara')).toEqual({ family: 'nunez', hash: 'scrypt$c2E=$aA==' })
})

test('parseUsers skips entries without a family tag', () => {
  const users = parseUsers('legacy:scrypt$c2E=$aA==')
  expect(users.has('legacy')).toBe(false)
})

test('parseUsers handles empty / undefined', () => {
  expect(parseUsers(undefined).size).toBe(0)
  expect(parseUsers('').size).toBe(0)
})

describe('parseCookies', () => {
  it('parses a cookie header', () => {
    expect(parseCookies('bt_session=abc.def; other=1')).toEqual({ bt_session: 'abc.def', other: '1' })
  })
  it('handles undefined', () => {
    expect(parseCookies(undefined)).toEqual({})
  })
})
