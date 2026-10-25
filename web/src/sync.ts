import { useSyncExternalStore } from 'react'
import { api, getSession, onSessionChange, signOut } from './auth'
import { actions, getState, subscribe } from './store'
import type { Trip } from './types'
import { flushAndClearVisited } from './visited'

/**
 * Keeps trips in the cloud while signed in. The browser copy stays the working copy, so the app
 * works offline; changes upload a moment after you make them, and the newest version of each trip wins.
 */

export type SyncStatus = 'off' | 'syncing' | 'saved' | 'offline' | 'error'

interface Remote {
  id: string
  updatedAt: number
  deleted: boolean
  data?: unknown
}

const SYNCED_KEY = 'traveler-er:synced'

/** The updatedAt of each trip as last saved in the cloud, so we know what changed or was deleted here. */
let synced: Record<string, number> = (() => {
  try {
    return JSON.parse(localStorage.getItem(SYNCED_KEY) ?? '{}') as Record<string, number>
  } catch {
    return {}
  }
})()
const saveSynced = () => {
  try {
    localStorage.setItem(SYNCED_KEY, JSON.stringify(synced))
  } catch {
    // storage unavailable; worst case we re-upload trips next time
  }
}

let status: SyncStatus = 'off'
let message = ''
const listeners = new Set<() => void>()
const setStatus = (s: SyncStatus, msg = '') => {
  status = s
  message = msg
  listeners.forEach((l) => l())
}
const snapshot = () => `${status}|${message}`
export const useSyncStatus = () => {
  const s = useSyncExternalStore((l) => (listeners.add(l), () => void listeners.delete(l)), snapshot)
  const [st, msg] = s.split('|')
  return { status: st as SyncStatus, message: msg }
}

/** Merge cloud trips into this device's trips: newest wins, and a deletion wins over an older copy. */
export function merge(local: Trip[], remote: Remote[]): { trips: unknown[]; synced: Record<string, number> } {
  const byId = new Map<string, unknown>(local.map((t) => [t.id, t]))
  const nextSynced: Record<string, number> = {}
  for (const r of remote) {
    const mine = local.find((t) => t.id === r.id)
    if (r.deleted) {
      if (!mine || mine.updatedAt <= r.updatedAt) byId.delete(r.id)
      continue
    }
    nextSynced[r.id] = r.updatedAt
    if (!mine || mine.updatedAt < r.updatedAt) byId.set(r.id, r.data)
  }
  return { trips: [...byId.values()], synced: nextSynced }
}

let running = false
let again = false
let timer: ReturnType<typeof setTimeout> | undefined

/** Upload changed trips and delete removed ones, one request at a time. */
async function push() {
  if (!getSession()) return
  if (running) return void (again = true)
  running = true
  try {
    const trips = getState().trips
    const changed = trips.filter((t) => synced[t.id] !== t.updatedAt)
    const removed = Object.keys(synced).filter((id) => !trips.some((t) => t.id === id))
    if (changed.length || removed.length) setStatus('syncing')
    for (const t of changed) {
      const r = await api(`/api/trips/${encodeURIComponent(t.id)}`, { method: 'PUT', body: JSON.stringify({ trip: t }) })
      if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? `Save failed (${r.status})`)
      synced[t.id] = t.updatedAt
      saveSynced()
    }
    for (const id of removed) {
      const r = await api(`/api/trips/${encodeURIComponent(id)}`, { method: 'DELETE' })
      if (!r.ok) throw new Error(`Delete failed (${r.status})`)
      delete synced[id]
      saveSynced()
    }
    if (getSession()) setStatus('saved')
  } catch (e) {
    if (!getSession()) return
    const offline = e instanceof TypeError
    setStatus(offline ? 'offline' : 'error', offline ? 'Offline, will retry' : (e as Error).message)
    clearTimeout(timer)
    timer = setTimeout(push, 15_000)
  } finally {
    running = false
    if (again) {
      again = false
      void push()
    }
  }
}

let lastPull = 0

/** Fetch the cloud copy and merge it in, then upload whatever this device has that's newer. */
async function pull() {
  if (!getSession()) return
  lastPull = Date.now()
  setStatus('syncing')
  try {
    const r = await api('/api/trips')
    if (!r.ok) throw new Error(`Couldn't load your saved trips (${r.status})`)
    const { trips: remote } = (await r.json()) as { trips: Remote[] }
    if (!getSession()) return
    const m = merge(getState().trips, remote)
    synced = m.synced
    actions.replaceTrips(m.trips)
    // A cloud copy this app version can't read is left alone in the cloud, not deleted.
    for (const id of Object.keys(synced)) if (!getState().trips.some((t) => t.id === id)) delete synced[id]
    saveSynced()
    await push()
  } catch (e) {
    if (!getSession()) return
    const offline = e instanceof TypeError
    setStatus(offline ? 'offline' : 'error', offline ? 'Offline, will retry' : (e as Error).message)
  }
}

/** Upload everything pending, then sign out and remove trips and visited places from this device. */
export async function signOutAndClear() {
  clearTimeout(timer)
  await push()
  await flushAndClearVisited()
  await signOut()
  actions.clearAll()
}

let started = false

export function startSync() {
  if (started) return
  started = true
  let wasSignedIn = !!getSession()
  onSessionChange(() => {
    const now = !!getSession()
    if (now && !wasSignedIn) void pull()
    if (!now && wasSignedIn) {
      // Signed out (by choice or because the session expired): stop syncing and forget what was synced.
      clearTimeout(timer)
      synced = {}
      saveSynced()
      setStatus('off')
    }
    wasSignedIn = now
  })
  subscribe(() => {
    clearTimeout(timer)
    if (getSession()) timer = setTimeout(push, 1200)
  })
  // Pick up changes made on other devices when coming back to this tab.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - lastPull > 30_000) void pull()
  })
  window.addEventListener('online', () => void push())
  if (wasSignedIn) void pull()
}
