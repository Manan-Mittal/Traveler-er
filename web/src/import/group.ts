import { distanceKm } from '../geo.ts'
import type { Category, City } from '../types.ts'
import type { RawPlace } from './takeout.ts'

/** A list place once we know its coordinates and which city and country it's in. */
export interface ResolvedPlace extends RawPlace {
  lat: number
  lon: number
  city: string
  country: string
  countryCode: string
  category: Category
}

export interface CityGroup {
  name: string
  lat: number
  lon: number
  places: ResolvedPlace[]
}

export interface CountryGroup {
  country: string
  countryCode: string
  cities: CityGroup[]
  count: number
}

/** Group places by country, then city; biggest first. */
export function groupPlaces(places: ResolvedPlace[]): CountryGroup[] {
  const countries = new Map<string, Map<string, ResolvedPlace[]>>()
  for (const p of places) {
    const key = p.countryCode || p.country
    const cities = countries.get(key) ?? new Map<string, ResolvedPlace[]>()
    cities.set(p.city, [...(cities.get(p.city) ?? []), p])
    countries.set(key, cities)
  }
  return [...countries.values()]
    .map((cities) => {
      const groups = [...cities.entries()]
        .map(([name, ps]): CityGroup => ({
          name,
          lat: ps.reduce((n, p) => n + p.lat, 0) / ps.length,
          lon: ps.reduce((n, p) => n + p.lon, 0) / ps.length,
          places: ps,
        }))
        .sort((a, b) => b.places.length - a.places.length)
      const first = groups[0].places[0]
      return { country: first.country, countryCode: first.countryCode, cities: groups, count: groups.reduce((n, c) => n + c.places.length, 0) }
    })
    .sort((a, b) => b.count - a.count)
}

/** The trip city a place belongs to: same name first, otherwise the nearest one within 80 km. */
export function cityFor(place: { city: string; lat: number; lon: number }, cities: City[]): City | undefined {
  const named = cities.find((c) => c.name.toLowerCase() === place.city.toLowerCase())
  if (named) return named
  let best: City | undefined
  let bestKm = 80
  for (const c of cities) {
    const km = distanceKm(c, place)
    if (km < bestKm) {
      best = c
      bestKm = km
    }
  }
  return best
}

/** True when a place with this name is already within 150 m of one in the list. */
export const isDuplicate = (p: { name: string; lat: number; lon: number }, existing: { name: string; lat: number; lon: number }[]) =>
  existing.some((e) => e.name.toLowerCase() === p.name.toLowerCase() && distanceKm(e, p) < 0.15)

/** Flag emoji from a two-letter country code. */
export const flag = (code: string) =>
  /^[a-z]{2}$/i.test(code) ? String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65)) : '🌍'
