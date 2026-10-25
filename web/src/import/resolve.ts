import { cachedJson } from '../services/cache'
import { categoryOf } from '../services/geocode'
import { distanceKm } from '../geo'
import type { ResolvedPlace } from './group'
import type { RawPlace } from './takeout'

interface Feature {
  geometry: { coordinates: [number, number] }
  properties: { name?: string; city?: string; county?: string; state?: string; country?: string; countrycode?: string; osm_key?: string; osm_value?: string }
}

const WEEK = 7 * 24 * 3600 * 1000

const photon = (path: string, signal?: AbortSignal) =>
  cachedJson(
    `imp:${path}`,
    WEEK,
    async () => {
      const r = await fetch(`https://photon.komoot.io/${path}`, { signal })
      if (!r.ok) throw new Error(`Place lookup failed (${r.status})`)
      return ((await r.json()) as { features: Feature[] }).features
    },
    'photon',
    400,
    signal,
  )

const where = (f: Feature) => ({
  city: f.properties.city || f.properties.county || f.properties.state || 'Elsewhere',
  country: f.properties.country || 'Unknown country',
  countryCode: (f.properties.countrycode ?? '').toLowerCase(),
})

const lookup = (q: string, near: { lat: number; lon: number } | undefined, signal?: AbortSignal) =>
  photon(`api/?q=${encodeURIComponent(q)}&limit=5${near ? `&lat=${near.lat.toFixed(3)}&lon=${near.lon.toFixed(3)}` : ''}`, signal)

const pos = (f: Feature) => ({ lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] })

const centroid = (ps: { lat: number; lon: number }[]) =>
  ps.length ? { lat: ps.reduce((n, p) => n + p.lat, 0) / ps.length, lon: ps.reduce((n, p) => n + p.lon, 0) / ps.length } : undefined

/**
 * Work out where each place is with Photon (free OSM geocoder).
 * Places with coordinates get a reverse lookup for their city; places without get searched by name,
 * biased toward the rest of their list (or the list's own name, like "Taiwan").
 */
export async function resolvePlaces(
  raw: RawPlace[],
  onProgress: (done: number, total: number) => void,
  signal?: AbortSignal,
): Promise<{ found: ResolvedPlace[]; missing: RawPlace[]; lookupFailed: boolean }> {
  const found: ResolvedPlace[] = []
  const missing: RawPlace[] = []
  let lookupFailed = false
  // An abort should still stop the whole import; any other failure just means this place goes unresolved.
  const failed = (e: Error) => {
    if (e.name === 'AbortError') throw e
    lookupFailed = true
    return [] as Feature[]
  }
  // The same place listed twice in one list would otherwise be counted twice.
  const seen = new Set<string>()
  raw = raw.filter((p) => {
    const k = [p.listName, p.name.toLowerCase(), p.lat?.toFixed(5), p.lon?.toFixed(5), p.address ?? ''].join('|')
    return !seen.has(k) && !!seen.add(k)
  })
  let done = 0
  const tick = () => onProgress(++done, raw.length)

  for (const p of raw.filter((p) => p.lat != null && p.lon != null)) {
    const at = { lat: p.lat!, lon: p.lon! }
    // Nearby places almost always share a city; reuse it rather than asking again.
    const near = found.find((f) => distanceKm(f, at) < 1.5)
    if (near) {
      found.push({ ...p, ...at, city: near.city, country: near.country, countryCode: near.countryCode, category: 'other' })
    } else {
      const f = (await photon(`reverse?lat=${at.lat}&lon=${at.lon}`, signal).catch(failed))[0]
      const same = f?.properties.name?.toLowerCase() === p.name.toLowerCase()
      // We already know where it is, so keep it even if the city lookup fails.
      if (f) found.push({ ...p, ...at, ...where(f), category: same ? categoryOf(f.properties.osm_key, f.properties.osm_value) : 'other' })
      else found.push({ ...p, ...at, city: 'Elsewhere', country: 'Unknown country', countryCode: '', category: 'other' })
    }
    tick()
  }

  // Where a list's places should be: points a match must land near, and a point to bias the search toward.
  type Area = { points: { lat: number; lon: number }[]; km: number; bias?: { lat: number; lon: number } }
  const listArea = new Map<string, Area | undefined>()
  const areaOf = async (list: string) => {
    if (!listArea.has(list)) {
      const located = found.filter((f) => f.listName === list && f.countryCode)
      if (located.length) {
        // Only bias toward the middle when the list is in one region; the midpoint of Kyoto and Chicago is in the sea.
        const mid = centroid(located)!
        const tight = located.every((f) => distanceKm(f, mid) < 300)
        listArea.set(list, { points: located, km: 300, bias: tight ? mid : undefined })
      } else {
        // A list named after somewhere ("Taiwan", "Chicago eats") tells us where to look; "Want to go" doesn't.
        const named = (await lookup(list, undefined, signal).catch(failed))[0]
        const kind = named?.properties.osm_value ?? ''
        const isPlace = named && ['place', 'boundary'].includes(named.properties.osm_key ?? '')
        listArea.set(list, isPlace ? { points: [pos(named)], bias: pos(named), km: kind === 'country' ? 1500 : ['state', 'region', 'province'].includes(kind) ? 500 : 150 } : undefined)
      }
    }
    return listArea.get(list)
  }

  for (const p of raw.filter((p) => p.lat == null || p.lon == null)) {
    const area = await areaOf(p.listName)
    const features = await lookup(p.address ? `${p.name}, ${p.address}` : p.name, area?.bias, signal).catch(failed)
    // Only trust matches near the rest of the list: "Din Tai Fung" exists on three continents.
    // A spread-out list has no single area to trust, so a search that included the place's own address is taken as is.
    const f = area && (area.bias || !p.address) ? features.find((f) => area.points.some((a) => distanceKm(pos(f), a) < area.km)) : features[0]
    if (f) found.push({ ...p, ...pos(f), ...where(f), category: categoryOf(f.properties.osm_key, f.properties.osm_value) })
    else missing.push(p)
    tick()
  }
  return { found, missing, lookupFailed }
}
