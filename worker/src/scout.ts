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
  'https://overpass.openstreetmap.fr/api/interpreter',
  'https://overpass.osm.jp/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
]

const UA = 'Traveler-er/0.1 (https://github.com/Manan-Mittal/Traveler-er)'

/** Public Overpass servers are often overloaded or block cloud traffic, so ask all of them at once and take the first answer. */
async function overpass(query: string): Promise<Osm> {
  const ask = async (url: string): Promise<Osm> => {
    const host = new URL(url).hostname
    let r: Response
    try {
      r = await fetch(url, {
        method: 'POST',
        body: 'data=' + encodeURIComponent(query),
        // Overpass operators ask clients to identify themselves and block anonymous traffic.
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA, Accept: 'application/json' },
        signal: AbortSignal.timeout(15_000),
      })
    } catch (e) {
      throw new Error(`${host} ${(e as Error).name === 'TimeoutError' ? 'timed out' : 'unreachable'}`)
    }
    if (!r.ok) throw new Error(`${host} ${r.status}`)
    return (await r.json()) as Osm
  }
  try {
    return await Promise.any(MIRRORS.map(ask))
  } catch (e) {
    throw new Error((e as AggregateError).errors.map((x: Error) => x.message).join(', '))
  }
}

/** Sights near a point from Wikipedia: a smaller but very reliable fallback when every Overpass server fails. */
async function wikipediaSights(lat: number, lon: number, radiusM: number): Promise<Candidate[]> {
  const url = `https://en.wikipedia.org/w/api.php?action=query&list=geosearch&gscoord=${lat}|${lon}&gsradius=${Math.min(radiusM, 10000)}&gslimit=60&format=json&origin=*`
  const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(10_000) })
  if (!r.ok) throw new Error(`wikipedia ${r.status}`)
  const data = (await r.json()) as { query?: { geosearch?: { pageid: number; title: string; lat: number; lon: number }[] } }
  return (data.query?.geosearch ?? [])
    .filter((p) => !isHyped(p.title))
    .map((p) => ({ id: `wikipedia/${p.pageid}`, name: p.title, lat: p.lat, lon: p.lon, category: 'sight', source: 'wikipedia' as const }))
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
  let data: Osm
  try {
    data = await overpass(query)
  } catch (e) {
    const sights = await wikipediaSights(lat, lon, radiusM).catch(() => [])
    if (sights.length > 0) return sights
    throw new Error(`The free map data servers are busy right now (${(e as Error).message}). Please try again in a minute.`)
  }
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
