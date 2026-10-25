export interface Step {
  agent: string
  text: string
  model?: string
}

/** Calls one planner stage and reads its newline-delimited stream: steps as they happen, then the result. */
export async function runStage<T>(stage: 'outline' | 'fill' | 'travel', body: unknown, onStep: (s: Step) => void, signal?: AbortSignal): Promise<T> {
  const r = await fetch(`${import.meta.env.VITE_API_URL}/api/agent/${stage}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  }).catch((e: Error) => {
    if (e.name === 'AbortError') throw e
    throw new Error("Couldn't reach the planner. Check your connection and try again.")
  })
  if (!r.ok || !r.body) {
    const b = (await r.json().catch(() => ({}))) as { error?: string }
    throw new Error(b.error ?? `Planner failed (${r.status})`)
  }
  const reader = r.body.pipeThrough(new TextDecoderStream()).getReader()
  let buf = ''
  for (;;) {
    const { value, done } = await reader.read()
    buf += value ?? ''
    const lines = buf.split('\n')
    buf = done ? '' : lines.pop()!
    for (const line of lines) {
      if (!line.trim()) continue
      const msg = JSON.parse(line) as { type: string; result?: T; error?: string } & Step
      if (msg.type === 'step') onStep({ agent: msg.agent, text: msg.text, model: msg.model })
      else if (msg.type === 'error') throw new Error(msg.error)
      else if (msg.type === 'result') return msg.result as T
    }
    if (done) throw new Error('The planner stopped before finishing. Try again.')
  }
}
