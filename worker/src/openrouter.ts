export interface Env {
  OPENROUTER_API_KEY: string
  ALLOWED_ORIGINS: string
}

interface ModelInfo {
  id: string
  context_length?: number
  pricing?: { prompt?: string; completion?: string }
}

let modelCache: { at: number; ids: string[] } | null = null

/** Models OpenRouter currently lists at $0 for both prompt and completion, largest context first. */
export async function freeModels(env: Env): Promise<string[]> {
  if (modelCache && Date.now() - modelCache.at < 3600_000) return modelCache.ids
  const r = await fetch('https://openrouter.ai/api/v1/models', { headers: { Authorization: `Bearer ${env.OPENROUTER_API_KEY}` } })
  if (!r.ok) throw new Error(`model list failed (${r.status})`)
  const { data } = (await r.json()) as { data: ModelInfo[] }
  const ids = data
    .filter((m) => Number(m.pricing?.prompt) === 0 && Number(m.pricing?.completion) === 0 && !m.id.includes('image'))
    .sort((a, b) => (b.context_length ?? 0) - (a.context_length ?? 0))
    .map((m) => m.id)
  modelCache = { at: Date.now(), ids }
  return ids
}

/** Ask a free model for JSON, trying the next one when a model is rate limited or returns garbage. */
export async function askJson<T>(env: Env, system: string, user: string, tries = 4): Promise<T> {
  const models = (await freeModels(env)).slice(0, tries)
  let lastError = 'no free models available'
  for (const model of models) {
    try {
      const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          temperature: 0.4,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        }),
      })
      if (!r.ok) {
        lastError = `${model}: ${r.status}`
        continue
      }
      const body = (await r.json()) as { choices?: { message?: { content?: string } }[] }
      const text = body.choices?.[0]?.message?.content ?? ''
      const match = text.match(/\{[\s\S]*\}/)
      if (!match) {
        lastError = `${model}: no JSON`
        continue
      }
      return JSON.parse(match[0]) as T
    } catch (e) {
      lastError = `${model}: ${(e as Error).message}`
    }
  }
  throw new Error(`All free models failed (${lastError})`)
}
