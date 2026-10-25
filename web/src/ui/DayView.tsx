import { actions } from '../store'
import type { Day, Stop, Trip, Zone } from '../types'
import type { DayGeo, Link } from '../useDayGeo'
import Search from './Search'
import Assistant from './Assistant'
import { Row, Sub, icon } from './kit'

const WALK_CHOICES = [15, 30, 45, 60] as const

const Seg = <T extends string | number>({ options, value, onChange, label }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; label: string }) => (
  <div role="group" aria-label={label} className="flex rounded-full bg-[var(--accent-soft)] p-0.5">
    {options.map((o) => (
      <button
        key={String(o.value)}
        aria-pressed={o.value === value}
        onClick={() => onChange(o.value)}
        className={`flex-1 whitespace-nowrap rounded-full px-2.5 py-1 text-[13px] font-medium transition ${o.value === value ? 'bg-[var(--surface-solid)] text-[var(--text)] shadow-sm' : 'text-[var(--text-2)]'}`}
      >
        {o.label}
      </button>
    ))}
  </div>
)

function LinkPill({ tripId, dayId, zone, from, link, fromColor, toColor }: { tripId: string; dayId: string; zone: Zone; from: Zone; link: Link; fromColor: string; toColor: string }) {
  const mode = zone.arriveBy === 'drive' ? 'drive' : 'transit'
  let text: string
  if (link === null) text = 'Finding the best way…'
  else if (link === 'none') text = mode === 'transit' ? 'No transit route found. Try driving.' : 'No driving route found.'
  else if (link.mode === 'drive') text = `${link.minutes} min drive${link.km != null ? ` · ${link.km} km` : ''}`
  else if (link.estimate) text = `About ${link.minutes} min by transit (estimate)`
  else text = `${link.minutes} min by transit${link.transfers ? ` · ${link.transfers} change${link.transfers > 1 ? 's' : ''}` : ''}`
  return (
    <div className="flex gap-3 py-1">
      <div className="ml-[18px] w-0.5 rounded-full" style={{ background: `linear-gradient(${fromColor}, ${toColor})` }} />
      <div className="min-w-0 flex-1 rounded-2xl bg-[var(--accent-soft)] p-3">
        <div className="flex items-center gap-2 text-[14px] font-semibold">
          <span aria-hidden>{mode === 'drive' ? '🚗' : '🚆'}</span>
          <span className="min-w-0 flex-1">{text}</span>
        </div>
        <Sub>
          {from.name} → {zone.name}
        </Sub>
        <div className="mt-2">
          <Seg
            label={`How to get to ${zone.name}`}
            value={mode}
            options={[
              { value: 'transit', label: '🚆 Transit' },
              { value: 'drive', label: '🚗 Drive' },
            ]}
            onChange={(v) => actions.patchZone(tripId, dayId, zone.id, { arriveBy: v })}
          />
        </div>
      </div>
    </div>
  )
}

function StopRow({ tripId, day, geo, stop, index, group }: { tripId: string; day: Day; geo: DayGeo; stop: Stop; index: number; group: Stop[] }) {
  const pos = group.findIndex((s) => s.id === stop.id)
  const shift = (delta: number) => {
    const neighbor = group[pos + delta]
    if (!neighbor) return
    actions.moveStop(tripId, day.id, day.stops.findIndex((s) => s.id === stop.id), day.stops.findIndex((s) => s.id === neighbor.id))
  }
  return (
    <Row>
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[13px] font-semibold text-white" style={{ background: geo.colorOf(stop), outline: geo.inZone(stop) === false ? '2px solid #ff9f0a' : undefined }}>
        {index + 1}
      </span>
      <div className="min-w-0 flex-1">
        <div className="line-clamp-2 text-[15px] font-medium leading-snug">
          {icon[stop.category]} {stop.name}
        </div>
        {stop.why && <Sub>{stop.why}</Sub>}
      </div>
      <button className="h-10 w-9 shrink-0 rounded-lg text-[var(--text-2)] disabled:opacity-20" aria-label={`Move ${stop.name} up`} disabled={pos === 0} onClick={() => shift(-1)}>↑</button>
      <button className="h-10 w-9 shrink-0 rounded-lg text-[var(--text-2)] disabled:opacity-20" aria-label={`Move ${stop.name} down`} disabled={pos === group.length - 1} onClick={() => shift(1)}>↓</button>
      <button className="h-10 w-9 shrink-0 rounded-lg text-[var(--text-2)]" aria-label={`Remove ${stop.name}`} onClick={() => actions.removeStop(tripId, day.id, stop.id)}>✕</button>
    </Row>
  )
}

function ZoneCard({ trip, day, geo, index }: { trip: Trip; day: Day; geo: DayGeo; index: number }) {
  const g = geo.zones[index]
  const zone = g.zone
  const group = geo.stops.filter((s) => geo.zoneOf(s) === zone.id)
  const outside = group.filter((s) => geo.inZone(s) === false).length
  const walking = group.reduce((n, s) => n + (geo.legs[geo.stops.indexOf(s) - 1]?.minutes ?? 0), 0)
  return (
    <section className="rounded-2xl border border-[var(--line)] p-4" style={{ borderLeft: `4px solid ${g.color}` }} aria-label={`Area ${index + 1}: ${zone.name}`}>
      <div className="flex items-center gap-2">
        <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: g.color }} />
        <h3 className="min-w-0 flex-1 truncate text-[17px] font-semibold tracking-tight">{zone.name}</h3>
        {day.zones.length > 1 && (
          <>
            <button className="h-8 w-8 rounded-lg text-[var(--text-2)] disabled:opacity-20" aria-label={`Move ${zone.name} earlier`} disabled={index === 0} onClick={() => actions.moveZone(trip.id, day.id, index, index - 1)}>↑</button>
            <button className="h-8 w-8 rounded-lg text-[var(--text-2)] disabled:opacity-20" aria-label={`Move ${zone.name} later`} disabled={index === day.zones.length - 1} onClick={() => actions.moveZone(trip.id, day.id, index, index + 1)}>↓</button>
          </>
        )}
        <button className="h-8 w-8 rounded-lg text-[var(--text-2)]" aria-label={`Remove area ${zone.name}`} onClick={() => actions.removeZone(trip.id, day.id, zone.id)}>✕</button>
      </div>
      <div className="mt-3">
        <Seg
          label={`Walking distance around ${zone.name}`}
          value={zone.walkMinutes}
          options={WALK_CHOICES.map((m) => ({ value: m, label: `${m} min` }))}
          onChange={(m) => actions.patchZone(trip.id, day.id, zone.id, { walkMinutes: m })}
        />
      </div>
      <Sub>
        {g.polygon ? 'Shaded area is everything within a walk of the center.' : g.error ? `Couldn't load the walk area right now: ${g.error}.` : 'Loading walk area…'}
        {outside > 0 && ` ${outside} stop${outside > 1 ? 's are' : ' is'} outside it (orange ring).`}
      </Sub>

      <div className="mt-2">
        {group.map((s, i) => {
          const gi = geo.stops.indexOf(s)
          const leg = i > 0 ? geo.legs[gi - 1] : null
          return (
            <div key={s.id}>
              {i > 0 && (
                <div className="ml-3.5 border-l-2 border-dashed border-[var(--line)] py-1.5 pl-5 text-[12px] text-[var(--text-2)]">
                  {leg ? `🚶 ${leg.minutes} min · ${leg.km} km` : geo.routeError ? '🚶 walk time unavailable' : '🚶 …'}
                </div>
              )}
              <StopRow tripId={trip.id} day={day} geo={geo} stop={s} index={gi} group={group} />
            </div>
          )
        })}
        {walking > 0 && <Sub>{walking} min walking in this area</Sub>}
      </div>

      <div className="mt-3 space-y-3">
        <Search
          near={zone}
          placeholder={`Add a place in ${zone.name}`}
          onPick={(p) => actions.addStop(trip.id, day.id, { name: p.name, lat: p.lat, lon: p.lon, category: p.category, notes: '', source: 'user', zoneId: zone.id })}
        />
        <Assistant key={`${zone.lat},${zone.lon},${zone.walkMinutes}`} tripId={trip.id} day={day} zone={zone} />
      </div>
    </section>
  )
}

export default function DayView({ trip, day, geo }: { trip: Trip; day: Day; geo: DayGeo }) {
  const city = trip.cities.find((c) => c.id === day.cityId)
  const near = day.zones.at(-1) ?? day.stops[0] ?? city
  const loose = geo.stops.filter((s) => !geo.zoneOf(s))

  return (
    <div className="space-y-5">
      <div>
        <input
          value={day.title}
          onChange={(e) => actions.patchDay(trip.id, day.id, { title: e.target.value })}
          aria-label="Day title"
          className="w-full rounded-lg bg-transparent text-[22px] font-bold tracking-tight outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        />
        <Sub>
          {day.date}
          {city && ` · ${city.name}`}
        </Sub>
      </div>

      {trip.cities.length > 0 && (
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label="City for this day">
          {trip.cities.map((c) => (
            <button
              key={c.id}
              aria-pressed={c.id === day.cityId}
              onClick={() => actions.setDayCity(trip.id, day.id, c.id === day.cityId ? undefined : c.id)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-[13px] font-medium ${c.id === day.cityId ? 'bg-[var(--accent)] text-white' : 'bg-[var(--accent-soft)] text-[var(--accent)]'}`}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      <div>
        {day.zones.map((z, i) => (
          <div key={z.id}>
            {i > 0 && <LinkPill tripId={trip.id} dayId={day.id} zone={z} from={day.zones[i - 1]} link={geo.links[i]} fromColor={geo.zones[i - 1].color} toColor={geo.zones[i].color} />}
            <ZoneCard trip={trip} day={day} geo={geo} index={i} />
          </div>
        ))}
      </div>

      {loose.length > 0 && (
        <section className="space-y-1">
          <h2 className="text-[13px] font-semibold uppercase tracking-wide text-[var(--text-2)]">Not in an area yet</h2>
          {loose.map((s) => (
            <StopRow key={s.id} tripId={trip.id} day={day} geo={geo} stop={s} index={geo.stops.indexOf(s)} group={loose} />
          ))}
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-[13px] font-semibold uppercase tracking-wide text-[var(--text-2)]">{day.zones.length === 0 ? "Today's area" : 'Add another area'}</h2>
        <Search
          near={near}
          placeholder={day.zones.length === 0 ? 'Pick a town or area to explore on foot' : 'Another neighborhood or town for this day'}
          onPick={(p) => actions.addZone(trip.id, day.id, { name: p.name, lat: p.lat, lon: p.lon, walkMinutes: 30, arriveBy: 'transit' })}
        />
        {day.zones.length > 0 && <Sub>Each area gets its own walking zone. Pick a transit or drive link between them.</Sub>}
      </section>
    </div>
  )
}
