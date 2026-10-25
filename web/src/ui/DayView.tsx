import { actions } from '../store'
import type { Day } from '../types'
import type { DayGeo } from '../useDayGeo'
import Search from './Search'
import Assistant from './Assistant'
import { TRANSIT_BUFFER_MIN } from '../services/transit'
import { Btn, Row, Sub, icon } from './kit'

const WALK_CHOICES = [15, 30, 45, 60] as const

export default function DayView({ tripId, day, geo }: { tripId: string; day: Day; geo: DayGeo }) {
  const near = day.zone ?? day.stops[0]
  const outside = day.stops.filter((s) => geo.inZone(s) === false).length
  const totalWalk = geo.legs.reduce((n, l) => n + (l?.minutes ?? 0), 0)

  return (
    <div className="space-y-5">
      <div>
        <input
          value={day.title}
          onChange={(e) => actions.patchDay(tripId, day.id, { title: e.target.value })}
          aria-label="Day title"
          className="w-full rounded-lg bg-transparent text-[22px] font-bold tracking-tight outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        />
        <Sub>{day.date}</Sub>
      </div>

      <section className="space-y-2">
        <h2 className="text-[13px] font-semibold uppercase tracking-wide text-[var(--text-2)]">Today's zone</h2>
        {day.zone ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[15px] font-medium">{day.zone.name}</span>
              <Btn kind="ghost" onClick={() => actions.patchDay(tripId, day.id, { zone: undefined })}>
                Clear
              </Btn>
            </div>
            <div className="flex gap-2">
              {WALK_CHOICES.map((m) => (
                <Btn
                  key={m}
                  className="flex-1 whitespace-nowrap px-2"
                  kind={day.zone!.walkMinutes === m ? 'primary' : 'plain'}
                  onClick={() => actions.patchDay(tripId, day.id, { zone: { ...day.zone!, walkMinutes: m } })}
                >
                  {m} min
                </Btn>
              ))}
            </div>
            <Sub>
              {geo.zone ? 'Shaded area is everything within a walk of the center.' : geo.zoneError ? `Couldn't load the walk area (${geo.zoneError}). Try again later.` : 'Loading walk area…'}
              {outside > 0 && ` ${outside} stop${outside > 1 ? 's are' : ' is'} outside it (orange pins).`}
            </Sub>
          </div>
        ) : (
          <Search
            near={near}
            placeholder="Pick a town or area to explore on foot"
            onPick={(p) => actions.patchDay(tripId, day.id, { zone: { name: p.name, lat: p.lat, lon: p.lon, walkMinutes: 30 } })}
          />
        )}
      </section>

      <Assistant key={day.zone ? `${day.zone.lat},${day.zone.lon},${day.zone.walkMinutes}` : 'none'} tripId={tripId} day={day} />

      <section className="space-y-2">
        <h2 className="text-[13px] font-semibold uppercase tracking-wide text-[var(--text-2)]">
          Stops{totalWalk > 0 && ` · ${totalWalk} min walking`}
        </h2>
        <div>
          {day.stops.map((s, i) => (
            <div key={s.id}>
              {i > 0 && (
                <div className="ml-4 border-l-2 border-dashed border-[var(--line)] py-1.5 pl-5 text-[12px] text-[var(--text-2)]">
                  {geo.legs[i - 1] ? `🚶 ${geo.legs[i - 1]!.minutes} min · ${geo.legs[i - 1]!.km} km` : geo.routeError ? '🚶 walk time unavailable' : '🚶 …'}
                  {geo.transit[i - 1] && (
                    <span className="ml-3">
                      🚆 ~{geo.transit[i - 1]!.minutes + TRANSIT_BUFFER_MIN} min
                      {geo.transit[i - 1]!.transfers > 0 && ` · ${geo.transit[i - 1]!.transfers} change${geo.transit[i - 1]!.transfers > 1 ? 's' : ''}`}
                    </span>
                  )}
                </div>
              )}
              <Row>
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--accent)] text-[13px] font-semibold text-white" style={geo.inZone(s) === false ? { background: '#ff9f0a' } : undefined}>
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15px] font-medium">
                    {icon[s.category]} {s.name}
                  </div>
                  {s.why && <Sub>{s.why}</Sub>}
                </div>
                <button className="h-10 w-9 shrink-0 rounded-lg text-[var(--text-2)] disabled:opacity-20" aria-label={`Move ${s.name} up`} disabled={i === 0} onClick={() => actions.moveStop(tripId, day.id, i, i - 1)}>↑</button>
                <button className="h-10 w-9 shrink-0 rounded-lg text-[var(--text-2)] disabled:opacity-20" aria-label={`Move ${s.name} down`} disabled={i === day.stops.length - 1} onClick={() => actions.moveStop(tripId, day.id, i, i + 1)}>↓</button>
                <button className="h-10 w-9 shrink-0 rounded-lg text-[var(--text-2)]" aria-label={`Remove ${s.name}`} onClick={() => actions.removeStop(tripId, day.id, s.id)}>✕</button>
              </Row>
            </div>
          ))}
        </div>
        <Search
          near={near}
          placeholder="Add a place"
          onPick={(p) => actions.addStop(tripId, day.id, { name: p.name, lat: p.lat, lon: p.lon, category: p.category, notes: '', source: 'user' })}
        />
        {geo.routeError && <p className="text-[12px] text-[var(--danger)]">Couldn't get walking times ({geo.routeError}).</p>}
      </section>
    </div>
  )
}
