import { ready, type DbEnv } from './db.ts'

export interface GoogleUser {
  sub: string
  email: string
  name: string
  picture: string
}

export interface User {
  id: string
  email: string
  name: string
  picture: string
}

/** Thrown for anything the caller should see as a plain HTTP error. */
export class HttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

const SESSION_DAYS = 30
const ISSUERS = ['accounts.google.com', 'https://accounts.google.com']

const b64urlBytes = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))
const b64urlJson = (s: string): unknown => JSON.parse(new TextDecoder().decode(b64urlBytes(s)))
const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

let keyCache: { at: number; maxAge: number; keys: JsonWebKey[] } | null = null

/** Google's current signing keys, cached for as long as Google says they're valid. */
async function googleKeys(fetcher: typeof fetch = fetch): Promise<JsonWebKey[]> {
  if (keyCache && Date.now() - keyCache.at < keyCache.maxAge) return keyCache.keys
  const r = await fetcher('https://www.googleapis.com/oauth2/v3/certs')
  if (!r.ok) throw new HttpError(502, 'Could not reach Google to check your sign-in')
  const { keys } = (await r.json()) as { keys: JsonWebKey[] }
  const maxAge = Number(r.headers.get('Cache-Control')?.match(/max-age=(\d+)/)?.[1] ?? 3600) * 1000
  keyCache = { at: Date.now(), maxAge, keys }
  return keys
}

export const resetKeyCache = () => (keyCache = null)

/**
 * Checks a Google Identity Services ID token: RS256 signature against Google's published keys,
 * issuer, audience (our client id), expiry and a verified email.
 */
export async function verifyGoogleToken(token: string, clientId: string, now = Date.now(), fetcher: typeof fetch = fetch): Promise<GoogleUser> {
  const bad = new HttpError(401, 'Sign-in failed, please try again')
  const parts = token.split('.')
  if (parts.length !== 3 || token.length > 4096) throw bad
  let header: { alg?: string; kid?: string }
  let claims: Record<string, unknown>
  try {
    header = b64urlJson(parts[0]) as typeof header
    claims = b64urlJson(parts[1]) as typeof claims
  } catch {
    throw bad
  }
  if (header.alg !== 'RS256' || !header.kid) throw bad
  const jwk = (await googleKeys(fetcher)).find((k) => (k as { kid?: string }).kid === header.kid)
  if (!jwk) throw bad
  const key = await crypto.subtle.importKey('jwk', { ...jwk, alg: 'RS256', ext: true }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify'])
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlBytes(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`))
  if (!ok) throw bad
  const sec = now / 1000
  if (!ISSUERS.includes(String(claims.iss)) || claims.aud !== clientId) throw bad
  if (typeof claims.exp !== 'number' || claims.exp < sec - 60) throw bad
  if (typeof claims.iat === 'number' && claims.iat > sec + 300) throw bad
  if (typeof claims.sub !== 'string' || !claims.sub || claims.email_verified !== true || typeof claims.email !== 'string') throw bad
  return {
    sub: claims.sub,
    email: claims.email,
    name: typeof claims.name === 'string' ? claims.name.slice(0, 100) : '',
    picture: typeof claims.picture === 'string' && claims.picture.startsWith('https://') ? claims.picture.slice(0, 500) : '',
  }
}

/** Sessions are random tokens; only their SHA-256 hash is stored, so a database leak can't be replayed. */
const hash = async (token: string) => b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))))

export async function createSession(env: DbEnv, g: GoogleUser): Promise<{ token: string; user: User }> {
  await ready(env)
  const now = Date.now()
  const token = b64url(crypto.getRandomValues(new Uint8Array(32)))
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO users (id, email, name, picture, created_at) VALUES (?1, ?2, ?3, ?4, ?5)
       ON CONFLICT(id) DO UPDATE SET email = ?2, name = ?3, picture = ?4`,
    ).bind(g.sub, g.email, g.name, g.picture, now),
    env.DB.prepare('DELETE FROM sessions WHERE user_id = ?1 AND expires_at < ?2').bind(g.sub, now),
    env.DB.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?1, ?2, ?3)').bind(await hash(token), g.sub, now + SESSION_DAYS * 86400_000),
  ])
  return { token, user: { id: g.sub, email: g.email, name: g.name, picture: g.picture } }
}

const bearer = (req: Request) => req.headers.get('Authorization')?.match(/^Bearer ([\w-]{20,100})$/)?.[1] ?? null

/** The signed-in user for this request, or a 401. */
export async function requireUser(env: DbEnv, req: Request): Promise<User> {
  const token = bearer(req)
  if (!token) throw new HttpError(401, 'Sign in on the Trips screen to use this')
  await ready(env)
  const row = await env.DB.prepare(
    'SELECT u.id, u.email, u.name, u.picture FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?1 AND s.expires_at > ?2',
  )
    .bind(await hash(token), Date.now())
    .first<User>()
  if (!row) throw new HttpError(401, 'Your sign-in expired, please sign in again')
  return row
}

export async function endSession(env: DbEnv, req: Request) {
  const token = bearer(req)
  if (!token) return
  await ready(env)
  await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?1').bind(await hash(token)).run()
}
