import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resetKeyCache, verifyGoogleToken } from './auth.ts'

const CLIENT = 'test-client.apps.googleusercontent.com'
const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')

const { publicKey, privateKey } = await crypto.subtle.generateKey(
  { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
  true,
  ['sign', 'verify'],
)
const jwk = { ...(await crypto.subtle.exportKey('jwk', publicKey)), kid: 'k1' }
const certs = (async () => new Response(JSON.stringify({ keys: [jwk] }), { headers: { 'Cache-Control': 'max-age=60' } })) as unknown as typeof fetch

const now = Date.now()
const good = { iss: 'https://accounts.google.com', aud: CLIENT, sub: '123', email: 'a@b.c', email_verified: true, name: 'A', exp: now / 1000 + 600, iat: now / 1000 }

async function sign(claims: object, header: object = { alg: 'RS256', kid: 'k1' }, key = privateKey) {
  const data = `${enc(header)}.${enc(claims)}`
  const sig = Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(data))).toString('base64url')
  return `${data}.${sig}`
}

const rejects = async (token: string) => {
  resetKeyCache()
  await assert.rejects(verifyGoogleToken(token, CLIENT, now, certs), { status: 401 })
}

test('accepts a valid Google ID token', async () => {
  resetKeyCache()
  const u = await verifyGoogleToken(await sign(good), CLIENT, now, certs)
  assert.equal(u.sub, '123')
  assert.equal(u.email, 'a@b.c')
})

test('rejects wrong audience, issuer, expiry and unverified email', async () => {
  await rejects(await sign({ ...good, aud: 'someone-else' }))
  await rejects(await sign({ ...good, iss: 'https://evil.example' }))
  await rejects(await sign({ ...good, exp: now / 1000 - 3600 }))
  await rejects(await sign({ ...good, email_verified: false }))
})

test('rejects tampered, unsigned and foreign-key tokens', async () => {
  const t = await sign(good)
  const [h, , s] = t.split('.')
  await rejects(`${h}.${enc({ ...good, sub: 'attacker' })}.${s}`)
  await rejects(`${enc({ alg: 'none', kid: 'k1' })}.${enc(good)}.`)
  await rejects(await sign(good, { alg: 'HS256', kid: 'k1' }))
  await rejects(await sign(good, { alg: 'RS256', kid: 'unknown' }))
  const other = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign'])
  await rejects(await sign(good, undefined, other.privateKey))
  await rejects('not-a-jwt')
})
