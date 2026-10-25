/** A place as it comes out of a Google Takeout file, before we know where it is. */
export interface RawPlace {
  name: string
  listName: string
  note: string
  url?: string
  address?: string
  lat?: number
  lon?: number
}

/** RFC 4180 CSV: quoted fields, doubled quotes, newlines inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  const src = text.replace(/^\uFEFF/, '')
  const endField = () => {
    row.push(field)
    field = ''
  }
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        field += '"'
        i++
      } else if (c === '"') quoted = false
      else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') endField()
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++
      endField()
      rows.push(row)
      row = []
    } else field += c
  }
  if (field || row.length) {
    endField()
    rows.push(row)
  }
  return rows
}

const validLatLon = (lat: number, lon: number) =>
  Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && !(lat === 0 && lon === 0)

/** Pull coordinates out of the Google Maps URL shapes that carry them. Most Takeout list URLs don't. */
export function coordsFromUrl(url: string): { lat: number; lon: number } | undefined {
  let u = url
  try {
    u = decodeURIComponent(url)
  } catch {
    // keep the raw url
  }
  const patterns = [/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/, /@(-?\d+\.\d+),(-?\d+\.\d+)/, /[?&](?:q|query|ll|destination)=(-?\d+\.\d+),\s*(-?\d+\.\d+)/]
  for (const p of patterns) {
    const m = u.match(p)
    if (m && validLatLon(+m[1], +m[2])) return { lat: +m[1], lon: +m[2] }
  }
  return undefined
}

/** Takeout "Saved" folder: one CSV per list with columns Title, Note, URL (newer exports add Tags, Comment). */
export function parseListCsv(text: string, listName: string): RawPlace[] {
  const rows = parseCsv(text).filter((r) => r.some((f) => f.trim()))
  if (!rows.length) return []
  const head = rows[0].map((h) => h.trim().toLowerCase())
  const col = (name: string) => head.indexOf(name)
  const title = col('title')
  if (title < 0) throw new Error(`${listName}: not a Google Maps list (no Title column)`)
  const note = col('note')
  const comment = col('comment')
  const url = col('url')
  return rows.slice(1).flatMap((r) => {
    const name = r[title]?.trim()
    if (!name) return []
    const link = url >= 0 ? r[url]?.trim() || undefined : undefined
    const text = [note >= 0 ? r[note] : '', comment >= 0 ? r[comment] : ''].map((s) => s?.trim()).filter(Boolean).join(' · ')
    return [{ name, listName, note: text, url: link, ...(link ? coordsFromUrl(link) : undefined) }]
  })
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
const s = (x: unknown) => (typeof x === 'string' ? x.trim() : '')

/** Takeout "Saved Places.json" (starred places): GeoJSON, sometimes with 0,0 coordinates and only a URL. */
export function parseSavedPlacesJson(text: string, listName: string): RawPlace[] {
  const data: unknown = JSON.parse(text)
  if (!isObj(data) || !Array.isArray(data.features)) throw new Error(`${listName}: not a Google Maps saved places file`)
  return data.features.filter(isObj).flatMap((f) => {
    const p = isObj(f.properties) ? f.properties : {}
    const loc = isObj(p.location) ? p.location : isObj(p.Location) ? p.Location : {}
    const name = s(loc.name) || s(loc['Business Name']) || s(p.Title) || s(p.name)
    if (!name) return []
    const url = s(p.google_maps_url) || s(p['Google Maps URL']) || undefined
    const coords = isObj(f.geometry) && Array.isArray(f.geometry.coordinates) ? (f.geometry.coordinates as unknown[]) : []
    const [lon, lat] = coords.map(Number)
    const at = validLatLon(lat, lon) ? { lat, lon } : url ? coordsFromUrl(url) : undefined
    return [{ name, listName, note: s(p.Comment), url, address: s(loc.address) || s(loc.Address) || undefined, ...at }]
  })
}

/** Turn a Takeout file name like "Takeout/Saved/Taiwan eats.csv" into a list name. */
export const listNameOf = (path: string) => path.split('/').pop()!.replace(/\.(csv|json)$/i, '').trim() || 'Imported list'

/** Parse one Takeout file by extension. Unknown files return null so a zip's other contents are ignored. */
export function parseTakeoutFile(path: string, text: string): RawPlace[] | null {
  const name = listNameOf(path)
  if (/\.csv$/i.test(path)) return parseListCsv(text, name)
  if (/\.json$/i.test(path)) {
    try {
      return parseSavedPlacesJson(text, /saved places/i.test(name) ? 'Starred places' : name)
    } catch {
      return null
    }
  }
  return null
}
