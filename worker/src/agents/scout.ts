import { overpass, UA } from '../scout.ts'
import { isHyped } from '../verify.ts'
import { km, walkRadius, type Run } from './run.ts'

export interface Zone {
  key: string
  dayIndex: number
  date: string
  name: string
  lat: number
  lon: number
  walkMinutes: number
}

export interface Place {
  id: string
  zoneKey: string
  name: string
  lat: number
  lon: number
  category: string
  source: 'osm' | 'wikivoyage'
  /** A few OSM tags that say something about the place (cuisine, start_date, reservation, fee). */
  tags: Record<string, string>
  wikidata?: string
  /** Wikivoyage's description, written by travellers. */
  guide?: string
  fame?: number
}

const KEEP_TAGS = ['cuisine', 'start_date', 'reservation', 'fee', 'heritage', 'opening_hours', 'tourism', 'historic', 'amenity', 'leisure', 'natural', 'shop']

const categoryOf = (t: Record<string, string>) => {
  if (t.amenity === 'cafe') return 'cafe'
  if (t.amenity && ['restaurant', 'fast_food', 'bar', 'pub', 'food_court', 'marketplace'].includes(t.amenity)) return 'food'
  if (t.shop === 'bakery' || t.shop === 'tea') return 'food'
  if (t.natural || t.leisure) return 'nature'
  if (t.shop) return 'shop'
  return 'sight'
}

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

/** The zone a point belongs to: the nearest one whose walk radius contains it. */
const zoneFor = (zones: Zone[], lat: number, lon: number) => {
  let best: Zone | null = null
  let bestKm = Infinity
  for (const z of zones) {
    const d = km(z, { lat, lon })
    if (d * 1000 <= walkRadius(z.walkMinutes) && d < bestKm) (best = z), (bestKm = d)
  }
  return best
}

const cache = new Map<string, { at: number; places: Place[] }>()

/** Scout agent: every named place inside the zones, from one Overpass query plus Wikivoyage listings. */
export async function scoutZones(run: Run, zones: Zone[]): Promise<Place[]> {
  const key = zones.map((z) => `${z.lat.toFixed(3)},${z.lon.toFixed(3)},${z.walkMinutes}`).join('|')
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < 3600_000) {
    run.step('Scout', `Reused ${hit.places.length} places scouted in the last hour`)
    return hit.places
  }
  const [osm, guide] = await Promise.all([osmPlaces(zones), wikivoyagePlaces(zones).catch(() => [] as Place[])])
  const byName = new Map(osm.map((p) => [norm(p.name), p]))
  let matched = 0
  const extra: Place[] = []
  for (const g of guide) {
    const twin = byName.get(norm(g.name))
    if (twin) {
      twin.guide = g.guide
      matched++
    } else extra.push(g)
  }
  const places = [...osm, ...extra]
  run.step('Scout', `Found ${osm.length} places on OpenStreetMap and ${guide.length} Wikivoyage listings (${matched} on both) across ${zones.length} neighborhood${zones.length > 1 ? 's' : ''}`)
  if (cache.size > 50) cache.clear()
  cache.set(key, { at: Date.now(), places })
  return places
}

async function osmPlaces(zones: Zone[]): Promise<Place[]> {
  const parts = zones.flatMap((z) => {
    const a = `(around:${walkRadius(z.walkMinutes)},${z.lat},${z.lon})`
    return [
      `nwr[tourism~"^(attraction|museum|gallery|viewpoint|artwork)$"][name]${a};`,
      `nwr[historic][name]${a};`,
      `nwr[amenity~"^(restaurant|cafe|bar|pub|marketplace)$"][name]${a};`,
      `nwr[shop~"^(bakery|tea|books|antiques|craft)$"][name]${a};`,
      `nwr[leisure~"^(park|garden)$"][name]${a};`,
      `nwr[natural~"^(peak|beach|waterfall|hot_spring)$"][name]${a};`,
    ]
  })
  const data = await overpass(`[out:json][timeout:25];(${parts.join('')});out center ${Math.min(250 * zones.length, 900)};`).catch((e: Error) => {
    throw new Error(`The free map data servers are busy right now (${e.message}). Please try again in a minute.`)
  })
  const out: Place[] = []
  for (const e of data.elements) {
    const t = e.tags ?? {}
    const name = t['name:en'] ?? t.name
    const lat = e.lat ?? e.center?.lat
    const lon = e.lon ?? e.center?.lon
    if (!name || lat == null || lon == null || isHyped(name) || t.brand || t['brand:wikidata']) continue
    const zone = zoneFor(zones, lat, lon)
    if (!zone) continue
    const tags: Record<string, string> = {}
    for (const k of KEEP_TAGS) if (t[k]) tags[k] = t[k].slice(0, 60)
    out.push({ id: `${e.type}/${e.id}`, zoneKey: zone.key, name: name.slice(0, 100), lat, lon, category: categoryOf(t), source: 'osm', tags, wikidata: /^Q\d+$/.test(t.wikidata ?? '') ? t.wikidata : undefined })
  }
  return out
}

const LISTING = /\{\{\s*(see|do|eat|drink|buy|listing)\s*\|([\s\S]*?)\}\}/gi

/** Pulls `{{see|name=…|lat=…|long=…|content=…}}` listings out of a Wikivoyage article. */
export function parseListings(wikitext: string): { kind: string; name: string; lat: number; lon: number; content: string }[] {
  const out = []
  for (const m of wikitext.matchAll(LISTING)) {
    const fields: Record<string, string> = {}
    for (const part of m[2].split(/\|(?=\s*[a-z]+\s*=)/i)) {
      const i = part.indexOf('=')
      if (i > 0) fields[part.slice(0, i).trim().toLowerCase()] = part.slice(i + 1).trim()
    }
    const lat = Number(fields.lat)
    const lon = Number(fields.long)
    const name = fields.name?.replace(/\[\[|\]\]|''+/g, '')
    if (!name || !fields.lat || !fields.long || !Number.isFinite(lat) || !Number.isFinite(lon)) continue
    const content = (fields.content ?? fields.description ?? '')
      .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1')
      .replace(/\{\{[^}]*\}\}|<[^>]+>|''+/g, '')
      .replace(/\s+/g, ' ')
      .trim()
    out.push({ kind: m[1].toLowerCase(), name: name.slice(0, 100), lat, lon, content: content.slice(0, 200) })
  }
  return out
}

const KIND_CATEGORY: Record<string, string> = { see: 'sight', do: 'sight', eat: 'food', drink: 'cafe', buy: 'shop', listing: 'sight' }

async function wikivoyagePlaces(zones: Zone[]): Promise<Place[]> {
  const api = 'https://en.wikivoyage.org/w/api.php'
  const get = async (q: string) => {
    const r = await fetch(`${api}?${q}&format=json&formatversion=2&origin=*`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(10_000) })
    if (!r.ok) throw new Error(`wikivoyage ${r.status}`)
    return r.json()
  }
  // The nearest articles to each zone are usually its district or town page, where the listings live.
  const titles = new Set<string>()
  for (const z of zones.slice(0, 6)) {
    const data = (await get(`action=query&list=geosearch&gscoord=${z.lat}|${z.lon}&gsradius=10000&gslimit=2`)) as { query?: { geosearch?: { title: string }[] } }
    for (const g of data.query?.geosearch ?? []) titles.add(g.title)
    if (titles.size >= 4) break
  }
  const out: Place[] = []
  for (const title of [...titles].slice(0, 4)) {
    const data = (await get(`action=parse&prop=wikitext&page=${encodeURIComponent(title)}`)) as { parse?: { wikitext?: string } }
    for (const l of parseListings(data.parse?.wikitext ?? '')) {
      const zone = zoneFor(zones, l.lat, l.lon)
      if (!zone || isHyped(l.name)) continue
      out.push({ id: `wikivoyage/${title}/${l.name}`, zoneKey: zone.key, name: l.name, lat: l.lat, lon: l.lon, category: KIND_CATEGORY[l.kind], source: 'wikivoyage', tags: {}, guide: l.content || undefined })
    }
  }
  return out
}
