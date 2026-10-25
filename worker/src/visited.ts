import { HttpError, type User } from './auth.ts'
import { ready, type DbEnv } from './db.ts'

const MAX_BYTES = 200_000

/** The places this user has marked as visited, or null if they haven't saved any yet. */
export async function getVisited(env: DbEnv, user: User): Promise<unknown> {
  await ready(env)
  const row = await env.DB.prepare('SELECT data FROM visited WHERE user_id = ?1').bind(user.id).first<{ data: string }>()
  return row ? JSON.parse(row.data) : null
}

/** Saves the whole list. Like trips, the worker only checks shape and size; the app re-validates on load. */
export async function putVisited(env: DbEnv, user: User, body: unknown) {
  const v = (body as { visited?: unknown })?.visited as { updatedAt?: unknown } | undefined
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new HttpError(400, 'bad visited list')
  const updatedAt = typeof v.updatedAt === 'number' && Number.isFinite(v.updatedAt) ? Math.min(v.updatedAt, Date.now() + 60_000) : Date.now()
  const data = JSON.stringify({ ...v, updatedAt })
  if (data.length > MAX_BYTES) throw new HttpError(413, 'Your visited list is too large to save')
  await ready(env)
  await env.DB.prepare(
    `INSERT INTO visited (user_id, data, updated_at) VALUES (?1, ?2, ?3)
     ON CONFLICT(user_id) DO UPDATE SET data = ?2, updated_at = ?3`,
  )
    .bind(user.id, data, updatedAt)
    .run()
}
