import { useState } from 'react'
import { actions } from '../store'
import type { Day, Trip } from '../types'
import { distanceKm } from '../geo'
import { Sub, icon } from './kit'
import LocalName from './LocalName'

const SHOW = 6

/** Places saved to the trip (like imported Google lists) waiting to be put into a day. */
export default function Inbox({ trip, day }: { trip: Trip; day?: Day }) {
  const [all, setAll] = useState(false)
  if (!trip.inbox.length) return null

  const city = trip.cities.find((c) => c.id === day?.cityId)
  const cityName = (id?: string) => trip.cities.find((c) => c.id === id)?.name
  // Today's city first, then closest to today's first zone.
  const anchor = day?.zones[0] ?? city
  const sorted = [...trip.inbox].sort(
    (a, b) => Number(b.cityId === city?.id) - Number(a.cityId === city?.id) || (anchor ? distanceKm(a, anchor) - distanceKm(b, anchor) : 0),
  )
  const shown = all ? sorted : sorted.slice(0, SHOW)
  const dayNo = day ? trip.days.indexOf(day) + 1 : 0
  const nearestZone = (p: { lat: number; lon: number }) =>
    day?.zones.reduce((best, z) => (distanceKm(z, p) < distanceKm(best, p) ? z : best), day.zones[0])?.id

  return (
    <section className="space-y-1" aria-label="Saved places">
      <h2 className="text-[13px] font-semibold uppercase tracking-wide text-[var(--text-2)]">Saved places · {trip.inbox.length}</h2>
      <div>
        {shown.map((s) => (
          <div key={s.id} className="flex items-center gap-2 border-b border-[var(--line)] py-2 last:border-0">
            <span className="w-6 shrink-0 text-center">{icon[s.category]}</span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[15px] font-medium">
                {s.url ? (
                  <a href={s.url} target="_blank" rel="noreferrer">
                    <LocalName text={s.name} />
                  </a>
                ) : (
                  <LocalName text={s.name} />
                )}
              </div>
              <div className="truncate text-[12px] text-[var(--text-2)]">{[cityName(s.cityId), s.listName, s.notes].filter(Boolean).join(' · ')}</div>
            </div>
            {day && (
              <button
                className="shrink-0 rounded-full bg-[var(--accent-soft)] px-3 py-1.5 text-[13px] font-medium text-[var(--accent)]"
                aria-label={`Add ${s.name} to day ${dayNo}`}
                onClick={() => actions.assignFromInbox(trip.id, s.id, day.id, nearestZone(s))}
              >
                + Day {dayNo}
              </button>
            )}
            <button className="h-9 w-8 shrink-0 rounded-lg text-[var(--text-2)]" aria-label={`Remove ${s.name}`} onClick={() => actions.removeFromInbox(trip.id, s.id)}>
              ✕
            </button>
          </div>
        ))}
      </div>
      {sorted.length > SHOW && (
        <button className="text-[13px] font-medium text-[var(--accent)]" onClick={() => setAll(!all)}>
          {all ? 'Show fewer' : `Show all ${sorted.length}`}
        </button>
      )}
      {!day && <Sub>Pick a day to add these to it.</Sub>}
    </section>
  )
}
