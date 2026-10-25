import { cachedJson } from './cache'

const BASE = 'https://valhalla1.openstreetmap.de'

type LngLat = [number, number]

/** Area you can reach on foot within `minutes`, as a GeoJSON polygon. */
export async function walkZone(lat: number, lon: number, minutes: number, signal?: AbortSignal): Promise<GeoJSON.Feature<GeoJSON.Polygon> | null> {
  const json = {
    locations: [{ lat, lon }],
    costing: 'pedestrian',
    contours: [{ time: minutes }],
    polygons: true,
    denoise: 0.5,
    generalize: 30,
  }
  const data = await cachedJson(
    `iso:${lat.toFixed(4)},${lon.toFixed(4)},${minutes}`,
    30 * 24 * 3600 * 1000,
    async () => {
      const r = await fetch(`${BASE}/isochrone?json=${encodeURIComponent(JSON.stringify(json))}`, { signal })
      if (!r.ok) throw new Error(`Walk zone failed (${r.status})`)
      return (await r.json()) as GeoJSON.FeatureCollection<GeoJSON.Polygon>
    },
    'valhalla',
    1100,
    signal,
  )
  return data.features[0] ?? null
}

export interface Leg {
  minutes: number
  km: number
  shape: LngLat[]
}

// Valhalla encodes route shapes as polyline with 6 decimal digits.
function decode(str: string): LngLat[] {
  const out: LngLat[] = []
  let i = 0, lat = 0, lon = 0
  while (i < str.length) {
    for (const axis of [0, 1]) {
      let shift = 0, result = 0, b: number
      do {
        b = str.charCodeAt(i++) - 63
        result |= (b & 0x1f) << shift
        shift += 5
      } while (b >= 0x20)
      const d = result & 1 ? ~(result >> 1) : result >> 1
      if (axis === 0) lat += d
      else lon += d
    }
    out.push([lon / 1e6, lat / 1e6])
  }
  return out
}

export type Costing = 'pedestrian' | 'auto'

export const walkLeg = (a: { lat: number; lon: number }, b: { lat: number; lon: number }, signal?: AbortSignal) => routeLeg(a, b, 'pedestrian', signal)
export const driveLeg = (a: { lat: number; lon: number }, b: { lat: number; lon: number }, signal?: AbortSignal) => routeLeg(a, b, 'auto', signal)

async function routeLeg(a: { lat: number; lon: number }, b: { lat: number; lon: number }, costing: Costing, signal?: AbortSignal): Promise<Leg> {
  const json = {
    locations: [
      { lat: a.lat, lon: a.lon },
      { lat: b.lat, lon: b.lon },
    ],
    costing,
  }
  const data = await cachedJson(
    `${costing === 'auto' ? 'drive' : 'walk'}:${a.lat.toFixed(5)},${a.lon.toFixed(5)}>${b.lat.toFixed(5)},${b.lon.toFixed(5)}`,
    30 * 24 * 3600 * 1000,
    async () => {
      const r = await fetch(`${BASE}/route?json=${encodeURIComponent(JSON.stringify(json))}`, { signal })
      if (!r.ok) throw new Error(`Route failed (${r.status})`)
      return (await r.json()) as { trip: { summary: { time: number; length: number }; legs: { shape: string }[] } }
    },
    'valhalla',
    1100,
    signal,
  )
  return {
    minutes: Math.max(1, Math.round(data.trip.summary.time / 60)),
    km: Math.round(data.trip.summary.length * 10) / 10,
    shape: decode(data.trip.legs[0].shape),
  }
}
