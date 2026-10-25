import { draftDay, type PlanRequest } from './plan.ts'
import { freeModels, type Env as AiEnv } from './openrouter.ts'
import { fetchSharedList } from './gmaps.ts'
import { HttpError, createSession, endSession, requireUser, verifyGoogleToken } from './auth.ts'
import { overQuota, type DbEnv } from './db.ts'
import { deleteTrip, listTrips, putTrip } from './trips.ts'

export interface Env extends AiEnv, DbEnv {
  GOOGLE_CLIENT_ID: string
}

const hits = new Map<string, number[]>()

/** Per-IP limit for unauthenticated endpoints. In-memory, so it's per worker instance; signed-in limits live in D1. */
const limited = (ip: string, perMinute: number) => {
  const now = Date.now()
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 60_000)
  recent.push(now)
  hits.set(ip, recent)
  if (hits.size > 10_000) hits.clear()
  return recent.length > perMinute
}

const num = (v: unknown, min: number, max: number) => (typeof v === 'number' && v >= min && v <= max ? v : null)

/** Parse a JSON body, refusing anything over `max` bytes. */
async function body(req: Request, max: number): Promise<unknown> {
  if (Number(req.headers.get('Content-Length') ?? 0) > max) throw new HttpError(413, 'request too large')
  const text = await req.text()
  if (text.length > max) throw new HttpError(413, 'request too large')
  try {
    return JSON.parse(text)
  } catch {
    throw new HttpError(400, 'bad request')
  }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const origin = req.headers.get('Origin') ?? ''
    const allowed = env.ALLOWED_ORIGINS.split(',').map((s) => s.trim())
    const cors: Record<string, string> = allowed.includes(origin)
      ? {
          'Access-Control-Allow-Origin': origin,
          Vary: 'Origin',
          'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Max-Age': '86400',
        }
      : {}
    const json = (data: unknown, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...cors },
      })

    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
    if (origin && !allowed.includes(origin)) return json({ error: 'origin not allowed' }, 403)

    const url = new URL(req.url)
    const ip = req.headers.get('CF-Connecting-IP') ?? 'local'
    const trip = url.pathname.match(/^\/api\/trips\/([^/]+)$/)?.[1]
    try {
      if (url.pathname === '/api/models' && req.method === 'GET') return json({ models: await freeModels(env) })

      if (url.pathname === '/api/auth/google' && req.method === 'POST') {
        if (!env.GOOGLE_CLIENT_ID) throw new HttpError(503, 'Sign-in is not set up yet')
        if (limited(ip, 10)) throw new HttpError(429, 'slow down, try again in a minute')
        const { credential } = ((await body(req, 8_000)) ?? {}) as { credential?: unknown }
        if (typeof credential !== 'string') throw new HttpError(400, 'bad request')
        return json(await createSession(env, await verifyGoogleToken(credential, env.GOOGLE_CLIENT_ID)))
      }
      if (url.pathname === '/api/auth/logout' && req.method === 'POST') {
        await endSession(env, req)
        return json({ ok: true })
      }

      // Everything below needs a signed-in user.
      const user = await requireUser(env, req)

      if (url.pathname === '/api/me' && req.method === 'GET') return json({ user })

      if (url.pathname === '/api/trips' && req.method === 'GET') return json({ trips: await listTrips(env, user) })
      if (trip && (req.method === 'PUT' || req.method === 'DELETE')) {
        if (await overQuota(env, user.id, 'save', 1200)) throw new HttpError(429, 'Too many saves, try again in a bit')
        if (req.method === 'PUT') await putTrip(env, user, decodeURIComponent(trip), await body(req, 1_100_000))
        else await deleteTrip(env, user, decodeURIComponent(trip))
        return json({ ok: true })
      }

      if (url.pathname === '/api/plan' && req.method === 'POST') {
        if (await overQuota(env, user.id, 'plan', 40)) throw new HttpError(429, 'You’ve used the assistant a lot this hour, try again later')
        const b = ((await body(req, 4_000)) ?? {}) as Partial<PlanRequest>
        const lat = num(b.lat, -90, 90)
        const lon = num(b.lon, -180, 180)
        const walkMinutes = num(b.walkMinutes, 5, 90)
        if (lat == null || lon == null || walkMinutes == null || typeof b.place !== 'string') return json({ error: 'bad request' }, 400)
        const stops = await draftDay(env, {
          place: b.place.slice(0, 120),
          lat,
          lon,
          walkMinutes,
          interests: String(b.interests ?? '').slice(0, 300),
          stopCount: Math.min(Math.max(Number(b.stopCount) || 5, 2), 8),
        })
        return json({ stops })
      }
      if (url.pathname === '/api/gmaps-list' && req.method === 'GET') {
        if (await overQuota(env, user.id, 'gmaps', 30)) throw new HttpError(429, 'slow down, try again later')
        return json(await fetchSharedList(url.searchParams.get('url') ?? ''))
      }
      return json({ error: 'not found' }, 404)
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status)
      console.error(e)
      return json({ error: (e as Error).message }, 502)
    }
  },
}
