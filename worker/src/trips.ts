import { HttpError, type User } from './auth.ts'
import { ready, type DbEnv } from './db.ts'

const MAX_TRIP_BYTES = 1_000_000
const MAX_TRIPS = 300
const ID = /^[\w-]{1,64}$/

export interface StoredTrip {
  id: string
  updatedAt: number
  deleted: boolean
  data?: unknown
}

/** Every trip of this user, including deleted ones (without data) so other devices drop them too. */
export async function listTrips(env: DbEnv, user: User): Promise<StoredTrip[]> {
  await ready(env)
  const { results } = await env.DB.prepare('SELECT id, data, updated_at, deleted FROM trips WHERE user_id = ?1')
    .bind(user.id)
    .all<{ id: string; data: string; updated_at: number; deleted: number }>()
  return results.map((r) => ({ id: r.id, updatedAt: r.updated_at, deleted: !!r.deleted, data: r.deleted ? undefined : JSON.parse(r.data) }))
}

/**
 * Saves one trip. The worker only checks shape and size; the app re-validates trip contents
 * whenever it loads them, so a tampered row can't break or script the page.
 */
export async function putTrip(env: DbEnv, user: User, id: string, body: unknown) {
  if (!ID.test(id)) throw new HttpError(400, 'bad trip id')
  const trip = (body as { trip?: unknown })?.trip as { id?: unknown; updatedAt?: unknown } | undefined
  if (typeof trip !== 'object' || trip === null || Array.isArray(trip) || trip.id !== id) throw new HttpError(400, 'bad trip')
  const updatedAt = typeof trip.updatedAt === 'number' && Number.isFinite(trip.updatedAt) ? Math.min(trip.updatedAt, Date.now() + 60_000) : Date.now()
  const data = JSON.stringify(trip)
  if (data.length > MAX_TRIP_BYTES) throw new HttpError(413, 'This trip is too large to save')
  await ready(env)
  const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM trips WHERE user_id = ?1 AND deleted = 0 AND id != ?2').bind(user.id, id).first<{ n: number }>()
  if ((count?.n ?? 0) >= MAX_TRIPS) throw new HttpError(409, `You can save up to ${MAX_TRIPS} trips`)
  await env.DB.prepare(
    `INSERT INTO trips (user_id, id, data, updated_at, deleted) VALUES (?1, ?2, ?3, ?4, 0)
     ON CONFLICT(user_id, id) DO UPDATE SET data = ?3, updated_at = ?4, deleted = 0`,
  )
    .bind(user.id, id, data, updatedAt)
    .run()
}

/** Keeps a tombstone so a device that still has the trip deletes it instead of uploading it again. */
export async function deleteTrip(env: DbEnv, user: User, id: string) {
  if (!ID.test(id)) throw new HttpError(400, 'bad trip id')
  await ready(env)
  await env.DB.prepare(
    `INSERT INTO trips (user_id, id, data, updated_at, deleted) VALUES (?1, ?2, '', ?3, 1)
     ON CONFLICT(user_id, id) DO UPDATE SET data = '', updated_at = ?3, deleted = 1`,
  )
    .bind(user.id, id, Date.now())
    .run()
}
