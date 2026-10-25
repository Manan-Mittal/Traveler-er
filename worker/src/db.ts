export interface DbEnv {
  DB: D1Database
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT NOT NULL, name TEXT NOT NULL, picture TEXT NOT NULL, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS sessions_user ON sessions (user_id)`,
  `CREATE TABLE IF NOT EXISTS trips (user_id TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, updated_at INTEGER NOT NULL, deleted INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (user_id, id))`,
  `CREATE TABLE IF NOT EXISTS usage (user_id TEXT NOT NULL, what TEXT NOT NULL, hour INTEGER NOT NULL, count INTEGER NOT NULL, PRIMARY KEY (user_id, what, hour))`,
]

let created: Promise<unknown> | null = null

/** Creates the tables on first use in each worker instance, so there's no separate migration step to run. */
export const ready = (env: DbEnv) => (created ??= env.DB.batch(SCHEMA.map((s) => env.DB.prepare(s))).catch((e) => ((created = null), Promise.reject(e))))

/**
 * Counts a use of `what` for this user in the current hour and says whether they're over `perHour`.
 * Stored in D1, so unlike an in-memory counter it holds across worker instances.
 */
export async function overQuota(env: DbEnv, userId: string, what: string, perHour: number): Promise<boolean> {
  await ready(env)
  const hour = Math.floor(Date.now() / 3600_000)
  const row = await env.DB.prepare(
    `INSERT INTO usage (user_id, what, hour, count) VALUES (?1, ?2, ?3, 1)
     ON CONFLICT(user_id, what, hour) DO UPDATE SET count = count + 1 RETURNING count`,
  )
    .bind(userId, what, hour)
    .first<{ count: number }>()
  if (Math.random() < 0.02) await env.DB.prepare('DELETE FROM usage WHERE hour < ?1').bind(hour - 1).run()
  return (row?.count ?? 0) > perHour
}
