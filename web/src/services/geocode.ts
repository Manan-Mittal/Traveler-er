import { cachedJson } from './cache'
import type { Category } from '../types'

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
  const bias = near ? `&lat=${near.lat.toFixed(2)}&lon=${near.lon.toFixed(2)}` : ''
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=8${bias}`
  const data = await cachedJson(
    `geo:${query.toLowerCase()}:${near ? near.lat.toFixed(1) + near.lon.toFixed(1) : ''}`,
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
