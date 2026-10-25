import type { Category, Zone } from '../types'

export interface DraftStop {
  name: string
  lat: number
  lon: number
  category: Category
  why: string
}

export const assistantEnabled = Boolean(import.meta.env.VITE_API_URL)

export async function draftDay(zone: Zone, interests: string, stopCount: number): Promise<DraftStop[]> {
  const r = await fetch(`${import.meta.env.VITE_API_URL}/api/plan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ place: zone.name, lat: zone.lat, lon: zone.lon, walkMinutes: zone.walkMinutes, interests, stopCount }),
  })
  const body = (await r.json()) as { stops?: DraftStop[]; error?: string }
  if (!r.ok || !body.stops) throw new Error(body.error ?? `Assistant failed (${r.status})`)
  return body.stops
}
