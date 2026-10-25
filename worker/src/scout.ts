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
  const r = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: 'data=' + encodeURIComponent(query), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } })
  if (!r.ok) throw new Error(`map data unavailable (${r.status})`)
  const data = (await r.json()) as Osm
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
