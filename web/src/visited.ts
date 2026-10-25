import { useSyncExternalStore } from 'react'
import { api, getSession, onSessionChange } from './auth'
import type { Visited, VisitedCity } from './world'

/**
 * The places someone has been, kept with their account. Like trips, the browser copy is the working
 * copy and the cloud copy follows a moment later; the newest copy wins.
 */

const KEY = 'traveler-er:visited'
// Set once this device has synced with the account, so the first sign-in merges instead of overwriting.
const SYNCED_KEY = 'traveler-er:visited-synced'

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
const ids = (x: unknown) => [...new Set((Array.isArray(x) ? x : []).filter((s): s is string => typeof s === 'string' && /^[A-Z0-9]{3}$/.test(s)))]

const empty = (): Visited => ({ countries: [], removed: [], cities: [], updatedAt: 0 })

/** Coerce untrusted JSON (storage or the cloud) into valid data. */
export function cleanVisited(x: unknown): Visited {
  if (!isObj(x)) return empty()
  const cities = (Array.isArray(x.cities) ? x.cities : [])
    .filter((c): c is VisitedCity => isObj(c) && typeof c.name === 'string' && typeof c.lat === 'number' && typeof c.lon === 'number' && Math.abs(c.lat) <= 90 && Math.abs(c.lon) <= 180)
    .slice(0, 2000)
    .map((c) => ({ id: typeof c.id === 'string' && c.id ? c.id.slice(0, 64) : crypto.randomUUID(), name: c.name.slice(0, 120), lat: c.lat, lon: c.lon }))
  return { countries: ids(x.countries), removed: ids(x.removed), cities, updatedAt: typeof x.updatedAt === 'number' && Number.isFinite(x.updatedAt) ? x.updatedAt : 0 }
}

const read = (k: string) => {
  try {
    return localStorage.getItem(k)
  } catch {
    return null
  }
}
const write = (k: string, v: string | null) => {
  try {
    if (v === null) localStorage.removeItem(k)
    else localStorage.setItem(k, v)
  } catch {
    // storage unavailable; keep in memory
  }
}

let state: Visited = (() => {
  try {
    return cleanVisited(JSON.parse(read(KEY) ?? 'null'))
  } catch {
    return empty()
  }
})()
const listeners = new Set<() => void>()

const set = (next: Visited, local = true) => {
  state = next
  write(KEY, JSON.stringify(state))
  listeners.forEach((l) => l())
  if (local) schedule()
}

export const useVisited = () => useSyncExternalStore((l) => (listeners.add(l), () => void listeners.delete(l)), () => state)

const change = (fn: (v: Visited) => Partial<Visited>) => set({ ...state, ...fn(state), updatedAt: Date.now() })

export const visitedActions = {
  /** Marks a country as visited or not. `fromTrips` says a trip put it there, so unmarking has to hide it. */
  setCountry(id: string, on: boolean, fromTrips: boolean) {
    change((v) =>
      on
        ? { countries: [...new Set([...v.countries, id])], removed: v.removed.filter((x) => x !== id) }
        : { countries: v.countries.filter((x) => x !== id), removed: fromTrips ? [...new Set([...v.removed, id])] : v.removed },
    )
  },
  addCity(c: Omit<VisitedCity, 'id'>) {
    change((v) => ({ cities: [...v.cities, { ...c, id: crypto.randomUUID() }] }))
  },
  removeCity(id: string) {
    change((v) => ({ cities: v.cities.filter((c) => c.id !== id) }))
  },
}

/** Both copies combined, for the first time this device meets the account. */
const union = (a: Visited, b: Visited): Visited => {
  const countries = [...new Set([...a.countries, ...b.countries])]
  return {
    countries,
    removed: [...new Set([...a.removed, ...b.removed])].filter((id) => !countries.includes(id)),
    cities: [...a.cities, ...b.cities.filter((c) => !a.cities.some((x) => x.name === c.name && Math.abs(x.lat - c.lat) < 0.5 && Math.abs(x.lon - c.lon) < 0.5))],
    updatedAt: Date.now(),
  }
}

const hasData = (v: Visited) => v.countries.length + v.removed.length + v.cities.length > 0

let timer: ReturnType<typeof setTimeout> | undefined
let pushed = 0
// Off until the account copy has been read, so a stale device can't overwrite it.
let live = false

function schedule() {
  clearTimeout(timer)
  if (getSession() && live) timer = setTimeout(push, 1200)
}

async function push() {
  if (!getSession() || state.updatedAt === pushed) return
  const sending = state
  try {
    const r = await api('/api/visited', { method: 'PUT', body: JSON.stringify({ visited: sending }) })
    if (!r.ok) throw new Error(String(r.status))
    pushed = sending.updatedAt
    write(SYNCED_KEY, '1')
  } catch {
    clearTimeout(timer)
    timer = setTimeout(push, 15_000)
  }
}

async function pull() {
  if (!getSession()) return
  try {
    const r = await api('/api/visited')
    // An older worker without this endpoint: keep the places in this browser for now.
    if (!r.ok) return
    const remote = cleanVisited(((await r.json()) as { visited?: unknown }).visited)
    if (!getSession()) return
    live = true
    if (!read(SYNCED_KEY) && hasData(state) && hasData(remote)) set(union(state, remote))
    else if (remote.updatedAt > state.updatedAt) {
      set(remote, false)
      pushed = remote.updatedAt
      write(SYNCED_KEY, '1')
    }
    else if (state.updatedAt > remote.updatedAt) await push()
    else write(SYNCED_KEY, '1')
  } catch {
    // offline; try again next time the tab comes back
  }
}

/** Upload anything pending, then forget this device's copy (used on sign-out, like trips). */
export async function flushAndClearVisited() {
  clearTimeout(timer)
  if (live) await push()
  live = false
  pushed = 0
  write(SYNCED_KEY, null)
  set(empty(), false)
}

let started = false
let lastPull = 0

export function startVisitedSync() {
  if (started) return
  started = true
  let wasSignedIn = !!getSession()
  const go = () => ((lastPull = Date.now()), void pull())
  onSessionChange(() => {
    const now = !!getSession()
    if (now && !wasSignedIn) go()
    if (!now) {
      clearTimeout(timer)
      live = false
    }
    wasSignedIn = now
  })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - lastPull > 30_000) go()
  })
  window.addEventListener('online', () => void push())
  if (wasSignedIn) go()
}
