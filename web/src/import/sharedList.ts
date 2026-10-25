import type { RawPlace } from './takeout'
import { authHeaders } from '../auth'

export const sharedListsEnabled = Boolean(import.meta.env.VITE_API_URL)

/** Read a public Google Maps shared list through the worker (Google has no browser-callable API for it). */
export async function fetchSharedList(link: string): Promise<RawPlace[]> {
  const r = await fetch(`${import.meta.env.VITE_API_URL}/api/gmaps-list?url=${encodeURIComponent(link.trim())}`, { headers: authHeaders() }).catch(() => {
    throw new Error("Couldn't reach the import service. Check your connection and try again.")
  })
  const body = (await r.json().catch(() => ({}))) as { name?: string; places?: { name: string; address: string; lat: number; lon: number; url?: string }[]; error?: string }
  if (!r.ok || !body.places) throw new Error(body.error ?? `Couldn't read that list (${r.status})`)
  const listName = body.name || 'Shared list'
  return body.places.map((p) => ({ name: p.name, listName, note: '', address: p.address || undefined, url: p.url, lat: p.lat, lon: p.lon }))
}
