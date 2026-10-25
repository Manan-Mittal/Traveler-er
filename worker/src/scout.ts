import type { Candidate } from './verify.ts'
import { isHyped } from './verify.ts'

interface Osm {
  elements: { type: string; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }[]
}

const categoryOf = (t: Record<string, string>) => {
  if (t.amenity === 'cafe') return 'cafe'
  if (t.amenity && ['restaurant', 'fast_food', 'bar', 'pub', 'food_court', 'marketplace'].includes(t.amenity)) return 'food'
  if (t.shop === 'bakery') return 'food'
  if (t.natural || t.leisure) return 'nature'
  if (t.shop) return 'shop'
  return 'sight'
}

const MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
]

/** Public Overpass servers get overloaded often, so try each mirror in turn before giving up. */
async function overpass(query: string): Promise<Osm> {
  const why: string[] = []
  for (const url of MIRRORS) {
    const host = new URL(url).hostname
    try {
      const r = await fetch(url, {
        method: 'POST',
        body: 'data=' + encodeURIComponent(query),
        // Overpass operators ask clients to identify themselves and block anonymous traffic.
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Traveler-er/0.1 (https://github.com/Manan-Mittal/Traveler-er)', Accept: 'application/json' },
        signal: AbortSignal.timeout(12_000),
      })
      if (r.ok) return (await r.json()) as Osm
      why.push(`${host} ${r.status}`)
    } catch (e) {
      why.push(`${host} ${(e as Error).name === 'TimeoutError' ? 'timed out' : 'unreachable'}`)
    }
  }
  throw new Error(`The free map data servers are busy right now (${why.join(', ')}). Please try again in a minute.`)
}

/** Real places within `radiusM` of a point, from OpenStreetMap. Chains and hype-worded names are dropped. */
export async function scout(lat: number, lon: number, radiusM: number): Promise<Candidate[]> {
  const around = `(around:${radiusM},${lat},${lon})`
  const query = `[out:json][timeout:20];(
    nwr[tourism~"^(attraction|museum|gallery|viewpoint|artwork)$"][name]${around};
    nwr[historic][name]${around};
    nwr[amenity~"^(restaurant|cafe|bar|marketplace)$"][name]${around};
    nwr[leisure~"^(park|garden)$"][name]${around};
    nwr[natural~"^(peak|beach|waterfall|hot_spring)$"][name]${around};
  );out center 300;`
  const data = await overpass(query)
  const out: Candidate[] = []
  for (const e of data.elements) {
    const t = e.tags ?? {}
    const name = t['name:en'] ?? t.name
    const la = e.lat ?? e.center?.lat
    const lo = e.lon ?? e.center?.lon
    if (!name || la == null || lo == null || isHyped(name) || t.brand) continue
    out.push({ id: `${e.type}/${e.id}`, name, lat: la, lon: lo, category: categoryOf(t), source: 'osm' })
  }
  return out
}
