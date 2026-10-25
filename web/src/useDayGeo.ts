import { useEffect, useMemo, useState } from 'react'
import type { Day, Stop, Zone } from './types'
import { driveLeg, walkLeg, walkZone, type Leg } from './services/valhalla'
import { inPolygon } from './geo'
import { TRANSIT_BUFFER_MIN, transitMinutes, type TransitLeg } from './services/transit'
import { orderedStops, zoneColor, zoneIdOf } from './zones'
import { useLang } from './lang'

export interface ZoneGeo {
  zone: Zone
  color: string
  polygon: GeoJSON.Feature<GeoJSON.Polygon> | null
  error: string
}

/** The hop from the previous zone into this one. `null` while loading, `'none'` when no route was found. */
export type Link = { mode: 'transit' | 'drive'; estimate?: boolean; legs?: TransitLeg[]; minutes: number; km?: number; transfers?: number; shape?: [number, number][] } | 'none' | null

export interface DayGeo {
  zones: ZoneGeo[]
  /** Stops in itinerary order (grouped by zone). */
  stops: Stop[]
  /** Walking leg from stops[i] to stops[i+1] when both are in the same zone, else null. */
  legs: (Leg | null)[]
  /** links[i] connects zones[i-1] to zones[i]; links[0] is always null. */
  links: Link[]
  routeError: string
  zoneOf: (s: Stop) => string | undefined
  colorOf: (s: Stop) => string
  inZone: (s: Stop) => boolean | null
}

const keyOf = (day: Day | undefined, fields: (z: Zone) => unknown[]) => JSON.stringify((day?.zones ?? []).map((z) => [z.id, ...fields(z)]))

/** Walk areas, walking legs inside each zone, and the transit or drive hop between zones for the selected day. */
export function useDayGeo(day: Day | undefined): DayGeo {
  const [polys, setPolys] = useState<Record<string, { polygon: ZoneGeo['polygon']; error: string }>>({})
  const [linkState, setLinkState] = useState<Record<string, Link>>({})
  const [legMap, setLegMap] = useState<Record<string, Leg | null>>({})
  const [routeError, setRouteError] = useState('')

  const zones = day?.zones ?? []
  const areaKey = keyOf(day, (z) => [z.lat, z.lon, z.walkMinutes])
  useEffect(() => {
    setPolys({})
    const ctl = new AbortController()
    for (const z of zones) {
      walkZone(z.lat, z.lon, z.walkMinutes, ctl.signal)
        .then((polygon) => !ctl.signal.aborted && setPolys((p) => ({ ...p, [z.id]: { polygon, error: '' } })))
        .catch((e: Error) => !ctl.signal.aborted && setPolys((p) => ({ ...p, [z.id]: { polygon: null, error: e.message } })))
    }
    return () => ctl.abort()
  }, [areaKey])

  const { lang } = useLang()
  const linkKey = keyOf(day, (z) => [z.lat, z.lon, z.arriveBy ?? 'transit']) + (day?.date ?? '') + lang
  useEffect(() => {
    setLinkState({})
    if (!day) return
    const ctl = new AbortController()
    const put = (id: string, v: Link) => !ctl.signal.aborted && setLinkState((p) => ({ ...p, [id]: v }))
    day.zones.forEach((z, i) => {
      if (i === 0) return
      const from = day.zones[i - 1]
      const mode = z.arriveBy === 'drive' ? 'drive' : 'transit'
      if (mode === 'drive') {
        driveLeg(from, z, ctl.signal)
          .then((l) => put(z.id, { mode, minutes: l.minutes, km: l.km, shape: l.shape }))
          .catch(() => put(z.id, 'none'))
      } else {
        transitMinutes(from, z, day.date)
          .then(async (t) => {
            if (t) return put(z.id, { mode, minutes: t.minutes + TRANSIT_BUFFER_MIN, transfers: t.transfers, legs: t.legs, shape: t.shape.length > 1 ? t.shape : undefined })
            // No timetable found: show a rough estimate from the driving time so the day still adds up.
            const d = await driveLeg(from, z, ctl.signal).catch(() => null)
            put(z.id, d ? { mode, estimate: true, minutes: Math.round(d.minutes * (d.km > 30 ? 1 : 1.6)) + TRANSIT_BUFFER_MIN, km: d.km } : 'none')
          })
          .catch(() => put(z.id, 'none'))
      }
    })
    return () => ctl.abort()
  }, [linkKey])

  const stops = useMemo(() => (day ? orderedStops(day) : []), [day])
  const zoneOf = useMemo(() => (s: Stop) => zoneIdOf(s, zones), [areaKey])
  const colorOf = useMemo(() => (s: Stop) => zoneColor(zones.findIndex((z) => z.id === zoneOf(s))), [areaKey, zoneOf])

  const pairs = stops.slice(1).map((s, i) => ({ a: stops[i], b: s, same: zoneOf(stops[i]) === zoneOf(s) }))
  const legKey = pairs.map((p) => `${p.a.id}>${p.b.id}:${p.same}`).join(',')
  useEffect(() => {
    setLegMap({})
    setRouteError('')
    const ctl = new AbortController()
    for (const p of pairs) {
      if (!p.same) continue
      walkLeg(p.a, p.b, ctl.signal)
        .then((l) => !ctl.signal.aborted && setLegMap((m) => ({ ...m, [`${p.a.id}>${p.b.id}`]: l })))
        .catch((e: Error) => !ctl.signal.aborted && setRouteError(e.message))
    }
    return () => ctl.abort()
  }, [legKey])

  const zoneGeos: ZoneGeo[] = useMemo(
    () => zones.map((z, i) => ({ zone: z, color: zoneColor(i), polygon: polys[z.id]?.polygon ?? null, error: polys[z.id]?.error ?? '' })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(zones), polys],
  )
  const inZone = useMemo(
    () => (s: Stop) => {
      const g = zoneGeos.find((x) => x.zone.id === zoneOf(s))
      return g?.polygon ? inPolygon(s.lon, s.lat, g.polygon.geometry) : null
    },
    [zoneGeos, zoneOf],
  )
  return {
    zones: zoneGeos,
    stops,
    legs: pairs.map((p) => legMap[`${p.a.id}>${p.b.id}`] ?? null),
    links: zones.map((z, i) => (i === 0 ? null : linkState[z.id] ?? null)),
    routeError,
    zoneOf,
    colorOf,
    inZone,
  }
}
