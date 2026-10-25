import { useMemo, useState } from 'react'
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

export default function App() {
  const { trips, tripId, dayId } = useStore()
  const [tab, setTab] = useState<'days' | 'book'>('days')
  const trip = trips.find((t) => t.id === tripId)
  const day = trip?.days.find((d) => d.id === dayId)
  const geo = useDayGeo(day)

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
      <MapView stops={geo.stops} zones={geo.zones} route={route} links={links} center={center} inZone={geo.inZone} colorOf={geo.colorOf} />
      <aside className="glass absolute inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] top-[45%] overflow-y-auto overflow-x-hidden p-5 landscape:inset-x-auto landscape:bottom-[max(0.75rem,env(safe-area-inset-bottom))] landscape:left-[max(0.75rem,env(safe-area-inset-left))] landscape:top-3 landscape:w-[min(400px,50%)] md:inset-x-auto md:bottom-4 md:left-4 md:top-4 md:w-[400px]">
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
                      className={`shrink-0 rounded-xl px-3 py-1.5 text-[13px] font-medium ${d.id === dayId ? 'bg-[var(--text)] text-[var(--bg)]' : 'bg-[var(--accent-soft)]'}`}
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
