import { actions } from '../store'
import type { City, Stop, Trip } from '../types'
import { cityFor, isDuplicate, type CityGroup } from './group'

/**
 * Put imported places into a trip's inbox. A trip that already has cities, or an import spanning
 * several cities, gets a City per group so each place is tagged with where it is.
 */
export function addToTrip(trip: Pick<Trip, 'id' | 'cities' | 'inbox' | 'days'>, groups: CityGroup[]): { added: number; skipped: number } {
  const cities: City[] = [...trip.cities]
  if (cities.length > 0 || groups.length > 1) {
    for (const g of groups) {
      if (!cityFor({ city: g.name, lat: g.lat, lon: g.lon }, cities)) {
        const city = { name: g.name, lat: g.lat, lon: g.lon }
        cities.push({ ...city, id: actions.addCity(trip.id, city) })
      }
    }
  }
  const existing: { name: string; lat: number; lon: number }[] = [...trip.inbox, ...trip.days.flatMap((d) => d.stops)]
  const stops: Omit<Stop, 'id'>[] = []
  let skipped = 0
  for (const p of groups.flatMap((g) => g.places)) {
    if (isDuplicate(p, existing)) {
      skipped++
      continue
    }
    existing.push(p)
    stops.push({
      name: p.name,
      lat: p.lat,
      lon: p.lon,
      category: p.category,
      notes: p.note,
      source: 'import',
      listName: p.listName,
      url: p.url && /^https:\/\//i.test(p.url) ? p.url : undefined,
      cityId: cities.length ? cityFor(p, cities)?.id : undefined,
    })
  }
  if (stops.length) actions.addToInbox(trip.id, stops)
  return { added: stops.length, skipped }
}
