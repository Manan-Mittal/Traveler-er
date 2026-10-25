/**
 * Reads a public Google Maps shared list. Google has no API for this, so it uses the same
 * undocumented endpoint the Maps web app calls (entitylist/getlist). It can break if Google
 * changes that endpoint; callers should show the Takeout import as the fallback.
 */

export interface ListPlace {
  name: string
  address: string
  lat: number
  lon: number
  url?: string
}

export interface SharedList {
  name: string
  places: ListPlace[]
}

const SHARE_HOSTS = ['maps.app.goo.gl', 'goo.gl', 'www.google.com', 'google.com', 'maps.google.com']
// A full browser user agent gets a JavaScript interstitial from the short link instead of a redirect.
const UA = 'Mozilla/5.0'

/** Only Google share links, so the worker can't be used to fetch arbitrary URLs. */
export const isShareLink = (raw: string) => {
  try {
    const u = new URL(raw.trim())
    return u.protocol === 'https:' && SHARE_HOSTS.includes(u.hostname)
  } catch {
    return false
  }
}

/** Find the list id and share token in the URL a share link redirects to (also inside a consent page's continue=). */
export function listRef(finalUrl: string): { id: string; token?: string } | null {
  let u = finalUrl
  for (let i = 0; i < 3; i++) {
    try {
      const next = decodeURIComponent(u)
      if (next === u) break
      u = next
    } catch {
      break
    }
  }
  const id = u.match(/!2s(-?[\w-]{10,})!/)?.[1] ?? u.match(/\/placelists\/list\/(-?[\w-]+)/)?.[1]
  if (!id) return null
  const token = u.match(/[?&]token=([\w-]+)/)?.[1]
  return { id, token }
}

export function getlistUrl(ref: { id: string; token?: string }): string {
  const page = `https://www.google.com/maps/placelists/list/${ref.id}${ref.token ? `?token=${ref.token}` : ''}`
  const session = crypto.randomUUID().replace(/-/g, '').slice(0, 22)
  const pb = `!2e2!3e2!4i500!6m3!1s${session}!15i204459!28e2!13s${encodeURIComponent(page)}!16b1`
  return `https://www.google.com/maps/preview/entitylist/getlist?authuser=0&hl=en&gl=us&pb=${pb}`
}

const arr = (x: unknown): unknown[] => (Array.isArray(x) ? x : [])
const str = (x: unknown) => (typeof x === 'string' ? x : '')

/** Decimal cid from the [hex, hex] pair Google returns, for a link back to the place. */
const cidUrl = (x: unknown) => {
  const last = arr(x).at(-1)
  try {
    if (typeof last === 'string' && last) return `https://www.google.com/maps?cid=${BigInt(last).toString()}`
  } catch {
    // unexpected format; skip the link
  }
  return undefined
}

/** Parse a getlist response body (JSON behind a )]}' guard). */
export function parseList(body: string): SharedList {
  const data: unknown = JSON.parse(body.replace(/^\)\]\}'\s*/, ''))
  const list = arr(arr(data)[0])
  const places = arr(list[8]).flatMap((p): ListPlace[] => {
    const info = arr(arr(p)[1])
    const at = arr(info[5])
    const lat = at[2]
    const lon = at[3]
    const name = str(arr(p)[2]) || str(info[2]).split(',')[0]
    if (!name || typeof lat !== 'number' || typeof lon !== 'number') return []
    return [{ name: name.trim(), address: str(info[4]), lat, lon, url: cidUrl(info[6]) }]
  })
  return { name: str(list[4]) || 'Shared list', places }
}

export async function fetchSharedList(link: string): Promise<SharedList> {
  if (!isShareLink(link)) throw new Error('That isn’t a Google Maps list link')
  const hop = await fetch(link.trim(), { headers: { 'User-Agent': UA }, redirect: 'follow' })
  const ref = listRef(hop.url) ?? listRef(await hop.text())
  if (!ref) throw new Error('Couldn’t find a list in that link. Open the list in Google Maps, tap Share, and copy the link.')
  const r = await fetch(getlistUrl(ref), { headers: { 'User-Agent': UA } })
  if (!r.ok) throw new Error(`Google wouldn’t share that list (${r.status}). Make sure it’s set to shared or public.`)
  let list: SharedList
  try {
    list = parseList(await r.text())
  } catch {
    throw new Error('Google sent something unexpected. The list may be private, or Google changed its format; try the Takeout import.')
  }
  if (!list.places.length) throw new Error('That list looks empty or private.')
  return list
}
