import { useEffect, useMemo, useState } from 'react'
import type { Day } from './types'
import { walkLeg, walkZone, type Leg } from './services/valhalla'
import { inPolygon } from './geo'
import { transitMinutes } from './services/transit'

export interface DayGeo {
  zone: GeoJSON.Feature<GeoJSON.Polygon> | null
  legs: (Leg | null)[]
  transit: ({ minutes: number; transfers: number } | null)[]
  zoneError: string
  routeError: string
  inZone: (s: { lat: number; lon: number }) => boolean | null
}

/** Walk zone polygon and walking legs between consecutive stops for the selected day. */
export function useDayGeo(day: Day | undefined): DayGeo {
  const [zone, setZone] = useState<DayGeo['zone']>(null)
  const [legs, setLegs] = useState<(Leg | null)[]>([])
  const [transit, setTransit] = useState<DayGeo['transit']>([])
  const [zoneError, setZoneError] = useState('')
  const [routeError, setRouteError] = useState('')

  const z = day?.zone
  useEffect(() => {
    setZone(null)
    setZoneError('')
    if (!z) return
    const ctl = new AbortController()
    walkZone(z.lat, z.lon, z.walkMinutes, ctl.signal)
      .then((f) => !ctl.signal.aborted && setZone(f))
      .catch((e: Error) => !ctl.signal.aborted && setZoneError(e.message))
    return () => ctl.abort()
  }, [z?.lat, z?.lon, z?.walkMinutes])

  const key = day?.stops.map((s) => s.id).join(',') ?? ''
  useEffect(() => {
    const stops = day?.stops ?? []
    setLegs(stops.slice(1).map(() => null))
    setTransit(stops.slice(1).map(() => null))
    setRouteError('')
    const ctl = new AbortController()
    const stale = () => ctl.signal.aborted
    stops.slice(1).forEach((s, i) => {
      walkLeg(stops[i], s, ctl.signal)
        .then((l) => {
          if (stale()) return
          setLegs((prev) => prev.map((p, j) => (j === i ? l : p)))
          // Only worth asking about transit when the walk is long.
          if (l.minutes > 25 && day) {
            transitMinutes(stops[i], s, day.date).then((t) => !stale() && setTransit((prev) => prev.map((p, j) => (j === i ? t : p))))
          }
        })
        .catch((e: Error) => !stale() && setRouteError(e.message))
    })
    return () => ctl.abort()
  }, [key])

  const inZone = useMemo(() => (s: { lat: number; lon: number }) => (zone ? inPolygon(s.lon, s.lat, zone.geometry) : null), [zone])
  return { zone, legs, transit, zoneError, routeError, inZone }
}
