import { useEffect, useMemo, useState } from 'react'
import type { Day } from './types'
import { walkLeg, walkZone, type Leg } from './services/valhalla'
import { inPolygon } from './geo'
import { transitMinutes } from './services/transit'

export interface DayGeo {
  zone: GeoJSON.Feature<GeoJSON.Polygon> | null
  legs: (Leg | null)[]
  transit: ({ minutes: number; transfers: number } | null)[]
  error: string
  inZone: (s: { lat: number; lon: number }) => boolean | null
}

/** Walk zone polygon and walking legs between consecutive stops for the selected day. */
export function useDayGeo(day: Day | undefined): DayGeo {
  const [zone, setZone] = useState<DayGeo['zone']>(null)
  const [legs, setLegs] = useState<(Leg | null)[]>([])
  const [transit, setTransit] = useState<DayGeo['transit']>([])
  const [error, setError] = useState('')

  const z = day?.zone
  useEffect(() => {
    setZone(null)
    if (!z) return
    let stale = false
    walkZone(z.lat, z.lon, z.walkMinutes)
      .then((f) => !stale && setZone(f))
      .catch((e: Error) => !stale && setError(e.message))
    return () => {
      stale = true
    }
  }, [z?.lat, z?.lon, z?.walkMinutes])

  const key = day?.stops.map((s) => s.id).join(',') ?? ''
  useEffect(() => {
    const stops = day?.stops ?? []
    setLegs(stops.slice(1).map(() => null))
    setTransit(stops.slice(1).map(() => null))
    let stale = false
    stops.slice(1).forEach((s, i) => {
      walkLeg(stops[i], s)
        .then((l) => {
          if (stale) return
          setLegs((prev) => prev.map((p, j) => (j === i ? l : p)))
          // Only worth asking about transit when the walk is long.
          if (l.minutes > 25 && day) {
            transitMinutes(stops[i], s, day.date).then((t) => !stale && setTransit((prev) => prev.map((p, j) => (j === i ? t : p))))
          }
        })
        .catch((e: Error) => !stale && setError(e.message))
    })
    return () => {
      stale = true
    }
  }, [key])

  const inZone = useMemo(() => (s: { lat: number; lon: number }) => (zone ? inPolygon(s.lon, s.lat, zone.geometry) : null), [zone])
  return { zone, legs, transit, error, inZone }
}
