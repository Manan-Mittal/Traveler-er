import { useState } from 'react'
import { actions } from '../store'
import type { Trip } from '../types'
import Search from './Search'
import { Btn, Sub } from './kit'
import { focusMap } from '../focus'
import { formatDay } from '../format'

/** Lets a country or multi-city trip list its cities and spread its days across them. */
export default function Cities({ trip }: { trip: Trip }) {
  const [open, setOpen] = useState(false)
  const showing = open || trip.cities.length > 0

  if (!showing) {
    return (
      <Btn className="w-full" onClick={() => setOpen(true)}>
        Trip across several cities?
      </Btn>
    )
  }
  const when = (id: string) => {
    const ds = trip.days.filter((d) => d.cityId === id).map((d) => d.date).sort()
    return ds.length === 0 ? 'no days yet' : ds.length === 1 ? formatDay(ds[0]) : `${formatDay(ds[0])} – ${formatDay(ds.at(-1)!)}`
  }
  const unassigned = trip.days.filter((d) => !d.cityId).length
  return (
    <section className="space-y-2" aria-label="Cities">
      <h2 className="text-[13px] font-semibold uppercase tracking-wide text-[var(--text-2)]">Cities</h2>
      {trip.cities.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {trip.cities.map((c) => (
            <span key={c.id} className="inline-flex items-center gap-1 rounded-full bg-[var(--accent-soft)] py-1 pl-3 pr-1 text-[13px] font-medium text-[var(--accent)]">
              <button className="py-1" aria-label={`Show ${c.name} on the map`} onClick={() => focusMap({ lat: c.lat, lon: c.lon, zoom: 11 })}>
                {c.name}
              </button>
              <span className="text-[var(--text-2)]">· {when(c.id)}</span>
              <button className="grid h-6 w-6 place-items-center rounded-full text-[var(--text-2)]" aria-label={`Remove ${c.name}`} onClick={() => actions.removeCity(trip.id, c.id)}>
                ✕
              </button>
            </span>
          ))}
        </div>
      )}
      <Search near={trip.cities.at(-1)} placeholder="Add a city, e.g. Taipei" onPick={(p) => actions.addCity(trip.id, { name: p.name, lat: p.lat, lon: p.lon })} />
      {trip.cities.length > 1 && unassigned > 0 && (
        <div className="flex items-center gap-2">
          <Btn onClick={() => actions.splitDaysAcrossCities(trip.id)}>
            Spread {unassigned} day{unassigned > 1 ? 's' : ''} across cities
          </Btn>
          <Sub>Days that already have a city stay put.</Sub>
        </div>
      )}
    </section>
  )
}
