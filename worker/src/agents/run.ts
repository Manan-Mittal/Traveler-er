import { askJson, type Env } from '../openrouter.ts'

export type Pace = 'relaxed' | 'balanced' | 'packed'

export interface Step {
  type: 'step'
  agent: string
  text: string
  model?: string
}

/** One agent run: the trace it streams to the user and the model-call budget it may spend. */
export class Run {
  llmCalls = 0
  readonly env: Env
  private readonly emit: (s: Step) => void
  private readonly maxLlmCalls: number

  constructor(env: Env, emit: (s: Step) => void, maxLlmCalls: number) {
    this.env = env
    this.emit = emit
    this.maxLlmCalls = maxLlmCalls
  }

  step(agent: string, text: string, model?: string) {
    this.emit({ type: 'step', agent, text, ...(model ? { model } : {}) })
  }

  /** A model call that counts against this run's budget and reports which free model answered. */
  async ask<T>(agent: string, system: string, user: string): Promise<T> {
    if (this.llmCalls >= this.maxLlmCalls) throw new Error('This plan used up its model budget. Try fewer days at once.')
    this.llmCalls++
    let used = ''
    const out = await askJson<T>(this.env, system, user, 3, (m) => (used = m))
    this.step(agent, 'answered', used)
    return out
  }
}

/** Runs `work` and streams its steps and result to the client as newline-delimited JSON. */
export function streamRun(env: Env, maxLlmCalls: number, headers: Record<string, string>, work: (run: Run) => Promise<unknown>): Response {
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>()
  const writer = writable.getWriter()
  const enc = new TextEncoder()
  const send = (x: unknown) => writer.write(enc.encode(JSON.stringify(x) + '\n')).catch(() => {})
  const run = new Run(env, send, maxLlmCalls)
  ;(async () => {
    try {
      await send({ type: 'result', result: await work(run) })
    } catch (e) {
      await send({ type: 'error', error: (e as Error).message })
    } finally {
      await writer.close().catch(() => {})
    }
  })()
  return new Response(readable, { headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store', ...headers } })
}

export const km = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => {
  const r = Math.PI / 180
  const h = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lon - a.lon) * r) / 2) ** 2
  return 12742 * Math.asin(Math.sqrt(h))
}

/** Metres you can comfortably cover on foot in `minutes`, the same rule the single-zone assistant uses. */
export const walkRadius = (minutes: number) => Math.round(minutes * 75)

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
export const obj = (x: unknown) => (isObj(x) ? x : {})
export const text = (x: unknown, max: number) => (typeof x === 'string' ? x.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max) : '')
export const num = (x: unknown, min: number, max: number) => (typeof x === 'number' && Number.isFinite(x) && x >= min && x <= max ? x : null)
export const date = (x: unknown) => (typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) && !isNaN(Date.parse(x)) ? x : null)
export const pace = (x: unknown): Pace => (x === 'relaxed' || x === 'packed' ? x : 'balanced')
export const list = (x: unknown, max: number) => (Array.isArray(x) ? x.slice(0, max) : [])

/** `days` before `date`, but never in the past. */
export const bookBy = (d: string, days: number, today = new Date().toISOString().slice(0, 10)) => {
  const t = new Date(Date.parse(d + 'T00:00:00Z') - days * 86400_000).toISOString().slice(0, 10)
  return t < today ? today : t
}
