import { useRef, useState } from 'react'
import { actions } from '../store'
import type { Trip, Zone } from '../types'
import { assistantEnabled } from '../services/assistant'
import type { Place } from '../services/geocode'
import { runStage, type Step } from '../agent/api'
import { fillBatches, knownNames, outlineRequest, planZones, travelLegs, type DraftBooking, type DraftStop, type Fill, type Outline, type Pace, type PlanZone, type Travel, type TravelLeg } from '../agent/planner'
import { Btn, Sub, icon } from './kit'
import Search from './Search'
import Searching from './Searching'

type Phase = 'ask' | 'outlining' | 'outline' | 'filling' | 'review'

const PACES: { value: Pace; label: string }[] = [
  { value: 'relaxed', label: 'Relaxed' },
  { value: 'balanced', label: 'Balanced' },
  { value: 'packed', label: 'Packed' },
]

const AGENT_COLOR: Record<string, string> = {
  Orchestrator: '#0a84ff',
  Geocoder: '#64d2ff',
  Scout: '#30d158',
  Fame: '#ff9f0a',
  Curator: '#bf5af2',
  Critic: '#ff453a',
  Logistics: '#ffd60a',
  Travel: '#5e5ce6',
}

const H2 = ({ children }: { children: React.ReactNode }) => <h2 className="text-[13px] font-semibold uppercase tracking-wide text-[var(--text-2)]">{children}</h2>

const Check = ({ on, toggle, label }: { on: boolean; toggle: () => void; label: string }) => (
  <input type="checkbox" aria-label={label} checked={on} onChange={toggle} className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--accent)]" />
)

function Trace({ steps, live }: { steps: Step[]; live: boolean }) {
  return (
    <ol className="space-y-1.5" aria-live="polite">
      {steps.map((s, i) => (
        <li key={i} className="flex items-start gap-2 text-[13px]">
          <span className="mt-[3px] shrink-0 rounded-full px-2 py-px text-[11px] font-semibold text-white" style={{ background: AGENT_COLOR[s.agent] ?? 'var(--text-2)' }}>
            {s.agent}
          </span>
          <span className="min-w-0 flex-1 text-[var(--text)]">
            {s.text}
            {s.model && <span className="text-[var(--text-2)]"> · {s.model.replace(/:free$/, '')}</span>}
          </span>
          {live && i === steps.length - 1 && <span className="mt-1 h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" aria-hidden />}
        </li>
      ))}
    </ol>
  )
}

const hours = (min: number) => `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, '0')}m`

/**
 * The AI planner. Agents draft; the traveller approves twice (neighborhoods, then places and bookings)
 * and nothing touches the trip until Apply.
 */
export default function Planner({ trip }: { trip: Trip }) {
  const [phase, setPhase] = useState<Phase>('ask')
  const [ask, setAsk] = useState('')
  const [pace, setPace] = useState<Pace>('balanced')
  const [home, setHome] = useState<Place | null>(null)
  const [steps, setSteps] = useState<Step[]>([])
  const [error, setError] = useState('')
  const [done, setDone] = useState('')
  const [outline, setOutline] = useState<Outline | null>(null)
  const [zones, setZones] = useState<PlanZone[]>([])
  const [stops, setStops] = useState<DraftStop[]>([])
  const [bookings, setBookings] = useState<DraftBooking[]>([])
  const [legs, setLegs] = useState<TravelLeg[]>([])
  const [dayInfo, setDayInfo] = useState<Fill['days']>([])
  const [rejected, setRejected] = useState<Fill['rejected']>([])
  const [off, setOff] = useState<Set<string>>(new Set())
  const abort = useRef<AbortController | null>(null)

  const toggle = (k: string) => setOff((s) => (s.has(k) ? new Set([...s].filter((x) => x !== k)) : new Set(s).add(k)))
  const onStep = (s: Step) => setSteps((x) => [...x, s])
  const fail = (e: unknown, back: Phase) => {
    if ((e as Error).name === 'AbortError') return
    setError((e as Error).message)
    setPhase(back)
  }

  const draftOutline = async () => {
    abort.current = new AbortController()
    setPhase('outlining')
    setSteps([])
    setError('')
    setDone('')
    setOff(new Set())
    try {
      const o = await runStage<Outline>('outline', outlineRequest(trip, ask.trim(), pace), onStep, abort.current.signal)
      setOutline(o)
      setZones(planZones(trip, o))
      setPhase('outline')
    } catch (e) {
      fail(e, 'ask')
    }
  }

  const findPlaces = async () => {
    abort.current = new AbortController()
    const chosen = zones.filter((z) => !off.has(`z:${z.key}`))
    setPhase('filling')
    setError('')
    const all: Fill = { stops: [], bookings: [], days: [], rejected: [] }
    try {
      for (const batch of fillBatches(chosen)) {
        const f = await runStage<Fill>('fill', { ask: ask.trim(), pace, zones: batch, existing: [...knownNames(trip), ...all.stops.map((s) => s.name)] }, onStep, abort.current.signal)
        all.stops.push(...f.stops)
        all.bookings.push(...f.bookings)
        all.days.push(...f.days)
        all.rejected.push(...f.rejected)
      }
      const travel = travelLegs(trip, chosen, home ?? undefined)
      const t: Travel = travel.length ? await runStage<Travel>('travel', { legs: travel }, onStep, abort.current.signal) : { legs: [], bookings: [] }
      setZones(chosen)
      setStops(all.stops)
      setBookings([...t.bookings, ...all.bookings])
      setLegs(t.legs)
      setDayInfo(all.days)
      setRejected(all.rejected)
      setOff(new Set())
      setPhase('review')
    } catch (e) {
      fail(e, 'outline')
    }
  }

  const apply = () => {
    const zoneIds = new Map<string, string>()
    let z = 0
    let s = 0
    let b = 0
    for (const zone of zones) {
      if (off.has(`z:${zone.key}`)) continue
      const day = trip.days[zone.dayIndex - 1]
      if (!day) continue
      if (zone.existing) zoneIds.set(zone.key, zone.key)
      else {
        zoneIds.set(zone.key, actions.addZone(trip.id, day.id, { name: zone.name, lat: zone.lat, lon: zone.lon, walkMinutes: ([15, 30, 45, 60].includes(zone.walkMinutes) ? zone.walkMinutes : 30) as Zone['walkMinutes'], arriveBy: 'transit' }))
        z++
      }
    }
    stops.forEach((st, i) => {
      const zone = zones.find((x) => x.key === st.zoneKey)
      const zoneId = zoneIds.get(st.zoneKey)
      const day = zone && trip.days[zone.dayIndex - 1]
      if (off.has(`s:${i}`) || !zoneId || !day) return
      actions.addStop(trip.id, day.id, { name: st.name, lat: st.lat, lon: st.lon, category: st.category, notes: '', source: 'assistant', why: st.why, url: st.url, zoneId, cityId: day.cityId })
      s++
    })
    bookings.forEach((bk, i) => {
      if (off.has(`b:${i}`)) return
      actions.addBooking(trip.id, { title: bk.title, kind: bk.kind, dayId: bk.dayIndex ? trip.days[bk.dayIndex - 1]?.id : undefined, deadline: bk.deadline, url: bk.url, status: 'todo' })
      b++
    })
    setDone(`Added ${[z && `${z} area${z > 1 ? 's' : ''}`, s && `${s} place${s > 1 ? 's' : ''}`, b && `${b} booking${b > 1 ? 's' : ''}`].filter(Boolean).join(', ') || 'nothing'} to ${trip.name}.`)
    setPhase('ask')
    setSteps([])
  }

  const cancel = () => {
    abort.current?.abort()
    setPhase(phase === 'filling' ? 'outline' : 'ask')
  }

  if (!assistantEnabled) return <Sub>The planner isn't connected yet.</Sub>

  // ---------- 1. Ask ----------
  if (phase === 'ask')
    return (
      <section className="space-y-4">
        <div className="space-y-1">
          <h2 className="text-[20px] font-bold tracking-tight">Plan with AI</h2>
          <Sub>A team of agents picks neighborhoods to walk, real local places, what to book and how to get between cities. You approve every change.</Sub>
        </div>
        {done && <p className="rounded-xl bg-[var(--accent-soft)] px-3 py-2 text-[14px] font-medium">✓ {done}</p>}
        <textarea
          aria-label="What's this trip about?"
          rows={4}
          value={ask}
          maxLength={600}
          onChange={(e) => setAsk(e.target.value)}
          placeholder="What's this trip about? e.g. old streets, tea houses, quiet temples, a hot spring day. No viral spots."
          className="w-full resize-none rounded-xl bg-[var(--accent-soft)] px-3.5 py-2.5 text-[16px] outline-none placeholder:text-[var(--text-2)] focus:ring-2 focus:ring-[var(--accent)]"
        />
        <div role="group" aria-label="Pace" className="flex rounded-full bg-[var(--accent-soft)] p-0.5">
          {PACES.map((o) => (
            <button
              key={o.value}
              aria-pressed={o.value === pace}
              onClick={() => setPace(o.value)}
              className={`flex-1 rounded-full px-2.5 py-1 text-[13px] font-medium transition ${o.value === pace ? 'bg-[var(--surface-solid)] text-[var(--text)] shadow-sm' : 'text-[var(--text-2)]'}`}
            >
              {o.label}
            </button>
          ))}
        </div>
        {home ? (
          <div className="flex items-center justify-between rounded-xl bg-[var(--accent-soft)] px-3.5 py-2.5 text-[15px]">
            <span>✈️ Coming from {home.name}</span>
            <button className="text-[var(--text-2)]" aria-label="Clear where you're coming from" onClick={() => setHome(null)}>✕</button>
          </div>
        ) : (
          <Search placeholder="Coming from (optional, for flights)" onPick={setHome} />
        )}
        <Btn kind="primary" className="w-full !py-3" disabled={!ask.trim()} onClick={draftOutline}>
          Draft a plan
        </Btn>
        {error && <p className="text-[13px] text-[var(--danger)]">{error}</p>}
        <Sub>Uses free AI models, which may keep prompts. Only place names, dates and what you type here are sent.</Sub>
      </section>
    )

  // ---------- Working ----------
  if (phase === 'outlining' || phase === 'filling')
    return (
      <section className="space-y-4">
        <h2 className="text-[20px] font-bold tracking-tight">{phase === 'outlining' ? 'Sketching your days' : 'Finding places'}</h2>
        <Searching />
        <Trace steps={steps} live />
        <Btn kind="ghost" className="-ml-3" onClick={cancel}>
          Cancel
        </Btn>
      </section>
    )

  // ---------- 2. Checkpoint: neighborhoods ----------
  if (phase === 'outline' && outline) {
    const count = zones.filter((z) => !off.has(`z:${z.key}`)).length
    return (
      <section className="space-y-4">
        <div className="space-y-1">
          <h2 className="text-[20px] font-bold tracking-tight">Where to walk</h2>
          <Sub>Untick any area you don't want. Nothing is added yet.</Sub>
        </div>
        {trip.days.map((d, i) => {
          const theme = outline.days.find((x) => x.index === i + 1)?.theme
          const dz = zones.filter((z) => z.dayIndex === i + 1)
          if (!dz.length && !theme) return null
          return (
            <div key={d.id} className="rounded-2xl border border-[var(--line)] p-3.5">
              <div className="flex items-baseline justify-between gap-2">
                <div className="text-[15px] font-semibold">Day {i + 1}{theme && ` · ${theme}`}</div>
                <div className="shrink-0 text-[12px] text-[var(--text-2)]">{d.date.slice(5)}</div>
              </div>
              {dz.length === 0 && <Sub>{d.zones.length ? 'Already planned.' : "Couldn't place any areas near this day's city. Add one on the Days tab."}</Sub>}
              {dz.map((z) => (
                <label key={z.key} className="mt-2 flex items-start gap-3">
                  <Check on={!off.has(`z:${z.key}`)} toggle={() => toggle(`z:${z.key}`)} label={`Keep ${z.name}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-medium">{z.name}</span>
                    <Sub>{z.existing ? 'Already in your trip; find places here' : z.why || `${z.walkMinutes} min walking area`}</Sub>
                  </span>
                </label>
              ))}
            </div>
          )
        })}
        <details className="text-[13px]">
          <summary className="cursor-pointer text-[var(--text-2)]">How this was made</summary>
          <div className="mt-2">
            <Trace steps={steps} live={false} />
          </div>
        </details>
        {error && <p className="text-[13px] text-[var(--danger)]">{error}</p>}
        <div className="flex gap-2">
          <Btn kind="primary" className="flex-1 !py-3" disabled={count === 0} onClick={findPlaces}>
            Find places in {count} area{count === 1 ? '' : 's'}
          </Btn>
          <Btn kind="ghost" onClick={() => setPhase('ask')}>
            Back
          </Btn>
        </div>
      </section>
    )
  }

  // ---------- 3. Checkpoint: places, bookings, travel ----------
  const chosen = stops.filter((st, i) => !off.has(`s:${i}`) && !off.has(`z:${st.zoneKey}`)).length
  const chosenBookings = bookings.filter((_, i) => !off.has(`b:${i}`)).length
  const newZones = zones.filter((z) => !z.existing && !off.has(`z:${z.key}`)).length
  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-[20px] font-bold tracking-tight">Review the plan</h2>
        <Sub>Every place is a real spot from open map data, checked by the critic. Untick anything you don't want.</Sub>
      </div>

      {legs.length > 0 && (
        <div className="space-y-2">
          <H2>Getting between places</H2>
          {legs.map((l, i) => (
            <div key={i} className="rounded-2xl bg-[var(--accent-soft)] p-3">
              <div className="text-[14px] font-semibold">
                {l.mode === 'flight' ? '✈️' : l.mode === 'drive' ? '🚗' : '🚄'} {l.fromName} → {l.toName}
              </div>
              <Sub>
                Day {l.dayIndex} · {l.summary}
                {l.estimate ? ' (estimate)' : ''}
                {l.lines.length > 0 && ` · ${l.lines.join(', ')}`}
              </Sub>
            </div>
          ))}
        </div>
      )}

      {trip.days.map((d, di) => {
        const dz = zones.filter((z) => z.dayIndex === di + 1)
        if (!dz.length) return null
        const info = dayInfo.find((x) => x.dayIndex === di + 1)
        return (
          <div key={d.id} className="space-y-2">
            <div className="flex items-baseline justify-between gap-2">
              <H2>Day {di + 1}</H2>
              {info && <span className="text-[12px] text-[var(--text-2)]">about {hours(info.minutes)}</span>}
            </div>
            {info?.warning && <p className="text-[12px] text-[#ff9f0a]">{info.warning}</p>}
            {dz.map((z) => {
              const zoneOff = off.has(`z:${z.key}`)
              return (
                <div key={z.key} className="rounded-2xl border border-[var(--line)] p-3.5">
                  <label className="flex items-start gap-3">
                    {z.existing ? <span className="mt-0.5 w-5 text-center" aria-hidden>📍</span> : <Check on={!zoneOff} toggle={() => toggle(`z:${z.key}`)} label={`Add area ${z.name}`} />}
                    <span className="min-w-0 flex-1">
                      <span className="block text-[16px] font-semibold tracking-tight">{z.name}</span>
                      <Sub>{z.existing ? 'Already in your trip' : 'New walking area'}</Sub>
                    </span>
                  </label>
                  <div className={zoneOff ? 'pointer-events-none opacity-40' : ''}>
                    {stops.map((st, i) =>
                      st.zoneKey !== z.key ? null : (
                        <label key={i} className="mt-3 flex items-start gap-3 border-t border-[var(--line)] pt-3">
                          <Check on={!off.has(`s:${i}`)} toggle={() => toggle(`s:${i}`)} label={`Add ${st.name}`} />
                          <span className="min-w-0 flex-1">
                            <span className="block text-[15px] font-medium leading-snug">
                              {icon[st.category] ?? '📍'} {st.name}
                            </span>
                            <Sub>{st.why}</Sub>
                            <span className="mt-1 flex flex-wrap gap-1">
                              {st.evidence.map((e) => (
                                <span key={e} className="rounded-full bg-[var(--accent-soft)] px-2 py-px text-[11px] text-[var(--text-2)]">
                                  {e}
                                </span>
                              ))}
                            </span>
                          </span>
                        </label>
                      ),
                    )}
                    {!stops.some((st) => st.zoneKey === z.key) && <Sub>No places passed the checks here. You can still add the area and search yourself.</Sub>}
                  </div>
                </div>
              )
            })}
          </div>
        )
      })}

      {bookings.length > 0 && (
        <div className="space-y-1">
          <H2>To book</H2>
          {bookings.map((bk, i) => (
            <label key={i} className="flex items-start gap-3 border-b border-[var(--line)] py-2.5 last:border-0">
              <Check on={!off.has(`b:${i}`)} toggle={() => toggle(`b:${i}`)} label={`Add booking ${bk.title}`} />
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-medium">{bk.title}</span>
                <Sub>
                  {bk.deadline && `Book by ${bk.deadline}. `}
                  {bk.why}
                </Sub>
              </span>
            </label>
          ))}
        </div>
      )}

      <details className="text-[13px]">
        <summary className="cursor-pointer text-[var(--text-2)]">
          How this was made{rejected.length > 0 && ` · ${rejected.length} pick${rejected.length > 1 ? 's' : ''} rejected`}
        </summary>
        <div className="mt-2 space-y-3">
          <Trace steps={steps} live={false} />
          {rejected.length > 0 && (
            <ul className="space-y-0.5 text-[12px] text-[var(--text-2)]">
              {rejected.map((r, i) => (
                <li key={i}>
                  ✕ {r.name}: {r.reason}
                </li>
              ))}
            </ul>
          )}
        </div>
      </details>

      <div className="sticky -bottom-5 -mx-5 -mb-5 flex gap-2 border-t border-[var(--line)] bg-[var(--surface)] p-4 backdrop-blur-xl">
        <Btn kind="primary" className="flex-1 !py-3" disabled={chosen + chosenBookings + newZones === 0} onClick={apply}>
          Add to trip
        </Btn>
        <Btn kind="ghost" onClick={() => (setPhase('ask'), setSteps([]))}>
          Discard
        </Btn>
      </div>
    </section>
  )
}
