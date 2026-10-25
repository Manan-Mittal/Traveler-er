import { cachedJson } from './cache'
import type { Category } from '../types'
import { coordsFromUrl } from '../import/takeout'
import { lang } from '../lang'

export interface Place {
  name: string
  detail: string
  lat: number
  lon: number
  category: Category
}

interface PhotonFeature {
  geometry: { coordinates: [number, number] }
  properties: { name?: string; city?: string; state?: string; country?: string; street?: string; osm_key?: string; osm_value?: string }
}

export const categoryOf = (key = '', value = ''): Category => {
  if (value === 'cafe') return 'cafe'
  if (['restaurant', 'fast_food', 'bar', 'pub', 'food_court', 'bakery', 'marketplace'].includes(value)) return 'food'
  if (key === 'tourism' || key === 'historic') return 'sight'
  if (key === 'natural' || key === 'leisure' || value === 'park') return 'nature'
  if (key === 'shop') return 'shop'
  if (value === 'hotel' || value === 'hostel' || value === 'guest_house') return 'stay'
  if (key === 'railway' || key === 'aeroway' || key === 'public_transport') return 'transit'
  return 'other'
}

export async function searchPlaces(q: string, near?: { lat: number; lon: number }): Promise<Place[]> {
  const query = q.trim()
  if (query.length < 2) return []
  if (/^https?:\/\/\S*(google\.[a-z.]+\/maps|goo\.gl|maps\.app)/i.test(query)) return fromGoogleLink(query)
  const bias = near ? `&lat=${near.lat.toFixed(2)}&lon=${near.lon.toFixed(2)}` : ''
  // Photon only knows a few languages; other names stay English and get translated on screen if needed.
  const l = ['de', 'fr'].includes(lang()) ? lang() : 'en'
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=8&lang=${l}${bias}`
  const data = await cachedJson(
    `geo-${l}:${query.toLowerCase()}:${near ? near.lat.toFixed(1) + near.lon.toFixed(1) : ''}`,
    24 * 3600 * 1000,
    async () => {
      const r = await fetch(url)
      if (!r.ok) throw new Error(`Search failed (${r.status})`)
      return (await r.json()) as { features: PhotonFeature[] }
    },
    'photon',
    400,
  )
  return data.features
    .filter((f) => f.properties.name)
    .map((f) => {
      const p = f.properties
      return {
        name: p.name!,
        detail: [p.street, p.city, p.state, p.country].filter(Boolean).join(', '),
        lon: f.geometry.coordinates[0],
        lat: f.geometry.coordinates[1],
        category: categoryOf(p.osm_key, p.osm_value),
      }
    })
}

/** A pasted Google Maps place link becomes a single pin, for spots OpenStreetMap doesn't have. */
function fromGoogleLink(link: string): Place[] {
  const at = coordsFromUrl(link)
  if (!at) throw new Error('That link has no location in it. Open it in Google Maps and copy the full link from the address bar.')
  let name = 'Pinned from Google Maps'
  try {
    name = decodeURIComponent(link.match(/\/place\/([^/@?]+)/)?.[1] ?? '').replace(/\+/g, ' ').trim() || name
  } catch {
    // keep the default name
  }
  return [{ name, detail: 'From your Google Maps link', ...at, category: 'other' }]
}
