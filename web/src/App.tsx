import { useMemo, useRef, useState } from 'react'
import MapView from './MapView'
import { actions, useStore } from './store'
import { useDayGeo } from './useDayGeo'
import TripList from './ui/TripList'
import DayView from './ui/DayView'
import Bookings from './ui/Bookings'
import Cities from './ui/Cities'
import Inbox from './ui/Inbox'
import type { MapLink } from './MapView'
import { zoneColor } from './zones'
import { Btn, Sub, Title } from './ui/kit'

// Where the bottom sheet's top edge sits on a phone held upright, as a fraction of the screen height.
const SHEET_STOPS = [0.78, 0.45, 0.1]

export default function App() {
  const { trips, tripId, dayId } = useStore()
  const [tab, setTab] = useState<'days' | 'book'>('days')
  const trip = trips.find((t) => t.id === tripId)
  const day = trip?.days.find((d) => d.id === dayId)
  const geo = useDayGeo(day)
  const [sheet, setSheet] = useState(1)
  const drag = useRef<number | null>(null)
  const nudge = (dir: number) => setSheet((i) => Math.max(0, Math.min(SHEET_STOPS.length - 1, i + dir)))

  const route = useMemo(() => geo.legs.flatMap((l) => (l ? [l.shape] : [])), [geo.legs])
  const links = useMemo<MapLink[]>(() => {
    const zs = day?.zones ?? []
    return zs.flatMap((z, i) => {
      if (i === 0) return []
      const l = geo.links[i]
      return [{ from: [zs[i - 1].lon, zs[i - 1].lat] as [number, number], to: [z.lon, z.lat] as [number, number], shape: l && l !== 'none' ? l.shape : undefined, color: zoneColor(i) }]
    })
  }, [day?.zones, geo.links])
  const city = trip?.cities.find((c) => c.id === day?.cityId)
  const center = day?.zones[0] ?? city
  return (
    <div className="relative h-full w-full overflow-hidden">
      <MapView sheetTop={SHEET_STOPS[Math.min(sheet, 1)]} stops={geo.stops} zones={geo.zones} route={route} links={links} center={center} inZone={geo.inZone} colorOf={geo.colorOf} />
      <aside
        style={{ top: `${SHEET_STOPS[sheet] * 100}%` }}
        className="glass absolute inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] overflow-y-auto overflow-x-hidden overscroll-contain p-5 pt-0 transition-[top] duration-300 landscape:top-3! md:top-4! md:pt-5 landscape:pt-5 landscape:inset-x-auto landscape:bottom-[max(0.75rem,env(safe-area-inset-bottom))] landscape:left-[max(0.75rem,env(safe-area-inset-left))] landscape:w-[min(400px,50%)] md:inset-x-auto md:bottom-4 md:left-4 md:w-[400px]"
      >
        <button
          aria-label={sheet === 2 ? 'Collapse the panel' : 'Expand the panel'}
          className="sticky top-0 z-10 -mx-5 mb-2 block w-[calc(100%+2.5rem)] touch-none rounded-t-2xl bg-[var(--surface-solid)] pb-2 pt-3 md:hidden landscape:hidden"
          onPointerDown={(e) => ((drag.current = e.clientY), e.currentTarget.setPointerCapture(e.pointerId))}
          onPointerUp={(e) => {
            const dy = e.clientY - (drag.current ?? e.clientY)
            drag.current = null
            if (Math.abs(dy) < 8) setSheet((i) => (i + 1) % SHEET_STOPS.length)
            else nudge(dy < 0 ? 1 : -1)
          }}
        >
          <span className="mx-auto block h-1.5 w-10 rounded-full bg-[var(--line)] ring-1 ring-[var(--text-2)]/30" />
        </button>
        {!trip ? (
          <TripList trips={trips} />
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Btn kind="ghost" className="-ml-3" onClick={() => (setTab('days'), actions.openTrip(null))}>
                ‹ Trips
              </Btn>
              <Btn kind="ghost" onClick={() => confirm(`Delete ${trip.name}?`) && (setTab('days'), actions.deleteTrip(trip.id))}>
                Delete
              </Btn>
            </div>
            <div>
              <Title>{trip.name}</Title>
              <Sub>
                {trip.startDate} to {trip.endDate}
              </Sub>
            </div>
            <div className="flex gap-2">
              <Btn kind={tab === 'days' ? 'primary' : 'plain'} onClick={() => setTab('days')}>Days</Btn>
              <Btn kind={tab === 'book' ? 'primary' : 'plain'} onClick={() => setTab('book')}>Bookings</Btn>
            </div>
            {tab === 'days' ? (
              <>
                <Cities trip={trip} />
                <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                  {trip.days.map((d, i) => (
                    <button
                      key={d.id}
                      onClick={() => actions.openDay(d.id)}
                      className={`shrink-0 rounded-xl px-3 py-1.5 pointer-coarse:py-2.5 text-[13px] font-medium ${d.id === dayId ? 'bg-[var(--text)] text-[var(--bg)]' : 'bg-[var(--accent-soft)]'}`}
                    >
                      {i + 1}
                      <span className="ml-1 opacity-60">{d.date.slice(5)}</span>
                    </button>
                  ))}
                </div>
                {day && <DayView key={day.id} trip={trip} day={day} geo={geo} />}
                <Inbox trip={trip} day={day} />
              </>
            ) : (
              <Bookings trip={trip} />
            )}
          </div>
        )}
      </aside>
    </div>
  )
}
