import { useState } from 'react'
import { actions } from '../store'
import type { Trip } from '../types'
import Search from './Search'
import { Btn, Sub } from './kit'

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
  const dayCount = (id: string) => trip.days.filter((d) => d.cityId === id).length
  return (
    <section className="space-y-2" aria-label="Cities">
      <h2 className="text-[13px] font-semibold uppercase tracking-wide text-[var(--text-2)]">Cities</h2>
      {trip.cities.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {trip.cities.map((c) => (
            <span key={c.id} className="inline-flex items-center gap-1 rounded-full bg-[var(--accent-soft)] py-1 pl-3 pr-1 text-[13px] font-medium text-[var(--accent)]">
              {c.name}
              <span className="text-[var(--text-2)]">· {dayCount(c.id)}d</span>
              <button className="grid h-6 w-6 place-items-center rounded-full text-[var(--text-2)]" aria-label={`Remove ${c.name}`} onClick={() => actions.removeCity(trip.id, c.id)}>
                ✕
              </button>
            </span>
          ))}
        </div>
      )}
      <Search near={trip.cities.at(-1)} placeholder="Add a city, e.g. Taipei" onPick={(p) => actions.addCity(trip.id, { name: p.name, lat: p.lat, lon: p.lon })} />
      {trip.cities.length > 1 && (
        <div className="flex items-center gap-2">
          <Btn onClick={() => actions.splitDaysAcrossCities(trip.id)}>Split days evenly</Btn>
          <Sub>Then tap a day to change its city.</Sub>
        </div>
      )}
    </section>
  )
}
