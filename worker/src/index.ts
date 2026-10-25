import { draftDay, type PlanRequest } from './plan.ts'
import { freeModels, type Env } from './openrouter.ts'
import { fetchSharedList } from './gmaps.ts'
import { agentRoute } from './agents/orchestrator.ts'

const hits = new Map<string, number[]>()

/** 10 assistant calls per minute per client. In-memory, so it resets when the worker restarts. */
const limited = (ip: string) => {
  const now = Date.now()
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 60_000)
  recent.push(now)
  hits.set(ip, recent)
  return recent.length > 10
}

const num = (v: unknown, min: number, max: number) => (typeof v === 'number' && v >= min && v <= max ? v : null)

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const origin = req.headers.get('Origin') ?? ''
    const allowed = env.ALLOWED_ORIGINS.split(',').map((s) => s.trim())
    const cors: Record<string, string> = allowed.includes(origin)
      ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }
      : {}
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...cors } })

    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
    if (origin && !allowed.includes(origin)) return json({ error: 'origin not allowed' }, 403)

    const url = new URL(req.url)
    try {
      if (url.pathname === '/api/models' && req.method === 'GET') return json({ models: await freeModels(env) })

      if (url.pathname === '/api/plan' && req.method === 'POST') {
        if (limited(req.headers.get('CF-Connecting-IP') ?? 'local')) return json({ error: 'slow down, try again in a minute' }, 429)
        const b = (await req.json()) as Partial<PlanRequest>
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
      if (url.pathname.startsWith('/api/agent/') && req.method === 'POST') {
        if (limited(req.headers.get('CF-Connecting-IP') ?? 'local')) return json({ error: 'slow down, try again in a minute' }, 429)
        if (Number(req.headers.get('Content-Length') ?? 0) > 64_000) return json({ error: 'request too large' }, 413)
        const body = await req.json().catch(() => null)
        const res = await agentRoute(url.pathname.slice('/api/agent/'.length), body, env, cors)
        if (res) return res
      }
      if (url.pathname === '/api/gmaps-list' && req.method === 'GET') {
        if (limited(req.headers.get('CF-Connecting-IP') ?? 'local')) return json({ error: 'slow down, try again in a minute' }, 429)
        return json(await fetchSharedList(url.searchParams.get('url') ?? ''))
      }
      return json({ error: 'not found' }, 404)
    } catch (e) {
      return json({ error: (e as Error).message }, 502)
    }
  },
}
