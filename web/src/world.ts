import { inPolygon } from './geo.ts'
import type { Trip } from './types.ts'

/**
 * Country outlines for the "Where I've been" map, from Natural Earth (public domain), served from
 * web/public/countries.json. Regenerate with:
 *   npx mapshaper ne_50m_admin_0_countries.geojson -each 'id=ADM0_A3, name=NAME, iso=ISO_A2_EH,
 *     continent=CONTINENT.indexOf("Seven")==0 ? (REGION_UN=="Americas" ? "South America" : REGION_UN) : CONTINENT,
 *     km2=Math.round(this.area/1e6)' -filter-fields id,name,iso,continent,km2 -simplify 12% keep-shapes
 *     -o precision=0.01 format=geojson countries.json
 * km2 is measured before simplifying, so areas stay accurate.
 */

export interface CountryProps {
  id: string
  name: string
  iso: string
  continent: string
  km2: number
}

export interface Country extends CountryProps {
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon
  /** [west, south, east, north] */
  bbox: [number, number, number, number]
}

export interface VisitedCity {
  id: string
  name: string
  lat: number
  lon: number
}

/** What the person marked by hand. Trips add to this on their own; `removed` hides countries a trip would add. */
export interface Visited {
  countries: string[]
  removed: string[]
  cities: VisitedCity[]
  updatedAt: number
}

export const CONTINENTS = 7

const polygons = (g: Country['geometry']) => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates)

export function toCountries(fc: GeoJSON.FeatureCollection): Country[] {
  return fc.features.flatMap((f) => {
    const g = f.geometry
    if (!g || (g.type !== 'Polygon' && g.type !== 'MultiPolygon')) return []
    const bbox: Country['bbox'] = [180, 90, -180, -90]
    for (const poly of polygons(g)) for (const [x, y] of poly[0]) {
      bbox[0] = Math.min(bbox[0], x)
      bbox[1] = Math.min(bbox[1], y)
      bbox[2] = Math.max(bbox[2], x)
      bbox[3] = Math.max(bbox[3], y)
    }
    return [{ ...(f.properties as CountryProps), geometry: g, bbox }]
  })
}

const near = (c: Country, lon: number, lat: number, pad: number) => lon >= c.bbox[0] - pad && lon <= c.bbox[2] + pad && lat >= c.bbox[1] - pad && lat <= c.bbox[3] + pad

/** Squared distance in degrees from a point to a segment; fine for "which coast is closest" over short distances. */
const segDist2 = (x: number, y: number, [ax, ay]: number[], [bx, by]: number[]) => {
  const dx = bx - ax
  const dy = by - ay
  const t = dx || dy ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy))) : 0
  return (x - ax - t * dx) ** 2 + (y - ay - t * dy) ** 2
}

// The outlines are simplified, so a harbor or beach can land just offshore. Snap to a coast this close (about 40 km).
const SNAP = 0.4

/** The country a point is in, or the nearest one if it sits just off a simplified coastline. */
export function countryAt(countries: Country[], lon: number, lat: number): Country | undefined {
  const candidates = countries.filter((c) => near(c, lon, lat, SNAP))
  const inside = candidates.find((c) => near(c, lon, lat, 0) && polygons(c.geometry).some((p) => inPolygon(lon, lat, { type: 'Polygon', coordinates: p })))
  if (inside) return inside
  let best: Country | undefined
  let bestD = SNAP * SNAP
  for (const c of candidates)
    for (const poly of polygons(c.geometry))
      for (let i = 1; i < poly[0].length; i++) {
        const d = segDist2(lon, lat, poly[0][i - 1], poly[0][i])
        if (d < bestD) {
          bestD = d
          best = c
        }
      }
  return best
}

/** Places from days that have already happened (today counts), plus every city of a trip that has ended. */
export function pastPlaces(trips: Trip[], today: string) {
  const points: { lat: number; lon: number; trip: string }[] = []
  const cities: { name: string; lat: number; lon: number; trip: string }[] = []
  for (const t of trips) {
    const past = t.days.filter((d) => d.date <= today)
    for (const d of past) for (const p of [...d.zones, ...d.stops]) points.push({ lat: p.lat, lon: p.lon, trip: t.name })
    const ended = t.endDate < today
    for (const c of t.cities)
      if (ended || past.some((d) => d.cityId === c.id)) {
        cities.push({ name: c.name, lat: c.lat, lon: c.lon, trip: t.name })
        points.push({ lat: c.lat, lon: c.lon, trip: t.name })
      }
  }
  return { points, cities }
}

export interface Summary {
  /** Every visited country id, with the trips that put it there (empty when marked by hand). */
  countries: Map<string, string[]>
  continents: Set<string>
  /** Share of the world's land area, 0 to 100. */
  landPct: number
  cities: (VisitedCity & { trip?: string })[]
}

const sameCity = (a: { name: string; lat: number; lon: number }, b: { name: string; lat: number; lon: number }) =>
  a.name.trim().toLowerCase() === b.name.trim().toLowerCase() && Math.abs(a.lat - b.lat) < 0.5 && Math.abs(a.lon - b.lon) < 0.5

export function summarize(countries: Country[], trips: Trip[], visited: Visited, today: string): Summary {
  const byId = new Map(countries.map((c) => [c.id, c]))
  const found = new Map<string, string[]>()
  const removed = new Set(visited.removed)
  const { points, cities } = pastPlaces(trips, today)
  // Many stops share a city, so look each rounded spot up once.
  const seen = new Map<string, Country | undefined>()
  for (const p of points) {
    const key = `${p.lon.toFixed(2)},${p.lat.toFixed(2)}`
    if (!seen.has(key)) seen.set(key, countryAt(countries, p.lon, p.lat))
    const c = seen.get(key)
    if (!c || removed.has(c.id)) continue
    const list = found.get(c.id) ?? []
    if (!list.includes(p.trip)) list.push(p.trip)
    found.set(c.id, list)
  }
  for (const id of visited.countries) if (byId.has(id) && !found.has(id)) found.set(id, [])
  const total = countries.reduce((s, c) => s + c.km2, 0)
  const mine = [...found.keys()].reduce((s, id) => s + (byId.get(id)?.km2 ?? 0), 0)
  const allCities: Summary['cities'] = [...visited.cities]
  for (const c of cities) if (!allCities.some((x) => sameCity(x, c))) allCities.push({ id: `trip:${c.trip}:${c.name}`, ...c })
  return {
    countries: found,
    continents: new Set([...found.keys()].map((id) => byId.get(id)!.continent)),
    landPct: total ? (mine / total) * 100 : 0,
    cities: allCities,
  }
}

