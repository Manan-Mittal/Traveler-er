export interface Env {
  OPENROUTER_API_KEY: string
  ALLOWED_ORIGINS: string
}

export interface ModelInfo {
  id: string
  context_length?: number
  pricing?: Record<string, string>
}

/** Only ever call models whose id ends in ":free" and whose every price field is zero, so no request can be billed. */
export const isFree = (m: ModelInfo) => {
  const prices = Object.values(m.pricing ?? {})
  return m.id.endsWith(':free') && prices.length > 0 && prices.every((p) => Number(p) === 0)
}

let modelCache: { at: number; ids: string[] } | null = null

/** Free models OpenRouter currently lists, largest context first. */
export async function freeModels(env: Env): Promise<string[]> {
  if (modelCache && Date.now() - modelCache.at < 3600_000) return modelCache.ids
  const r = await fetch('https://openrouter.ai/api/v1/models', { headers: { Authorization: `Bearer ${env.OPENROUTER_API_KEY}` } })
  if (!r.ok) throw new Error(`model list failed (${r.status})`)
  const { data } = (await r.json()) as { data: ModelInfo[] }
  const ids = data
    .filter((m) => isFree(m) && !m.id.includes('image'))
    .sort((a, b) => (b.context_length ?? 0) - (a.context_length ?? 0))
    .map((m) => m.id)
  modelCache = { at: Date.now(), ids }
  return ids
}

/** Ask a free model for JSON, trying the next one when a model is rate limited or returns garbage. */
export async function askJson<T>(env: Env, system: string, user: string, tries = 4, onModel?: (model: string) => void): Promise<T> {
  const models = (await freeModels(env)).filter((m) => m.endsWith(':free')).slice(0, tries)
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
      const parsed = JSON.parse(match[0]) as T
      onModel?.(model)
      return parsed
    } catch (e) {
      lastError = `${model}: ${(e as Error).message}`
    }
  }
  throw new Error(`All free models failed (${lastError})`)
}
