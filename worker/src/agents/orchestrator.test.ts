import test from 'node:test'
import assert from 'node:assert/strict'
import { agentRoute } from './orchestrator.ts'

const env = { OPENROUTER_API_KEY: 'test', ALLOWED_ORIGINS: '' }
const json = (x: unknown) => new Response(JSON.stringify(x), { headers: { 'Content-Type': 'application/json' } })
const chat = (x: unknown) => json({ choices: [{ message: { content: 'Sure! ' + JSON.stringify(x) } }] })

async function read(res: Response) {
  const lines = (await res.text()).trim().split('\n').map((l) => JSON.parse(l))
  return { steps: lines.filter((l) => l.type === 'step'), end: lines[lines.length - 1] }
}

test('fill: scouts, curates, sends a thin zone back once, and drafts bookings', async () => {
  const curatorAnswers = [
    // First pass invents a place and picks a world-famous one, so the critic sends the zone back.
    { zones: [{ zone: 'Z1', picks: [{ id: 'c999', why: 'made up' }, { id: 'c3', why: 'big' }] }] },
    { zones: [{ zone: 'Z1', picks: [{ id: 'c1', why: 'Family tea house since 1934.', book: 'none' }, { id: 'c2', why: 'Locals queue for lunch.', book: 'reserve' }] }] },
  ]
  const prompts: string[] = []
  const realFetch = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url.includes('overpass') || url.includes('mail.ru')) {
      return json({
        elements: [
          { type: 'node', id: 1, lat: 25.0555, lon: 121.5101, tags: { name: 'Grand Temple', historic: 'temple', wikidata: 'Q1' } },
          { type: 'node', id: 2, lat: 25.0556, lon: 121.5102, tags: { name: 'Lin Tea House', amenity: 'cafe', start_date: '1934' } },
          { type: 'node', id: 3, lat: 25.0557, lon: 121.5103, tags: { name: 'Auntie Noodles', amenity: 'restaurant', cuisine: 'noodle' } },
          { type: 'node', id: 4, lat: 25.0558, lon: 121.5104, tags: { name: 'Starbucks', amenity: 'cafe', brand: 'Starbucks' } },
        ],
      })
    }
    if (url.includes('wikivoyage')) return json(url.includes('geosearch') ? { query: { geosearch: [] } } : {})
    if (url.includes('wikidata')) return json({ entities: { Q1: { sitelinks: Object.fromEntries(Array.from({ length: 70 }, (_, i) => [`l${i}wiki`, {}])) } } })
    if (url.endsWith('/models')) return json({ data: [{ id: 'free/model:free', pricing: { prompt: '0', completion: '0' } }] })
    if (url.includes('chat/completions')) {
      prompts.push(JSON.parse(String(init?.body)).messages[1].content)
      return chat(curatorAnswers.shift())
    }
    throw new Error('unexpected fetch ' + url)
  }) as typeof fetch
  try {
    const res = await agentRoute('fill', { ask: 'tea and noodles', pace: 'relaxed', zones: [{ key: 'z1', dayIndex: 2, date: '2030-03-10', name: 'Dadaocheng', lat: 25.0556, lon: 121.5101, walkMinutes: 30 }], existing: [] }, env, {})
    const { steps, end } = await read(res!)
    assert.equal(end.type, 'result', JSON.stringify(end))
    assert.deepEqual(end.result.stops.map((s: { name: string }) => s.name), ['Lin Tea House', 'Auntie Noodles'])
    assert.deepEqual(end.result.stops[0].evidence, ['OpenStreetMap', 'No Wikipedia page', 'Since 1934'])
    assert.deepEqual(end.result.bookings.map((b: { title: string; deadline: string }) => [b.title, b.deadline]), [['Reserve Auntie Noodles', '2030-03-07']])
    assert.ok(steps.some((s) => s.agent === 'Critic' && s.text.startsWith('Sending Dadaocheng back')))
    assert.ok(steps.some((s) => s.model === 'free/model:free'))
    // The chain was filtered out before the model saw it, and the retry told the curator why.
    assert.ok(!prompts[0].includes('Starbucks'))
    assert.match(prompts[1], /world-famous/)
    assert.doesNotMatch(prompts[1], /c\d+\. Grand Temple/)
    assert.match(prompts[0], /c3\. Grand Temple \(sight; world-famous\)/)
  } finally {
    globalThis.fetch = realFetch
  }
})

test('rejects empty or malformed requests before spending anything', async () => {
  assert.equal((await agentRoute('outline', { ask: '', days: [] }, env, {}))!.status, 400)
  assert.equal((await agentRoute('fill', { zones: [{ lat: 'x' }] }, env, {}))!.status, 400)
  assert.equal(await agentRoute('nope', {}, env, {}), null)
})

test('outline: proposes neighborhoods for open days and drops ones geocoded far from the city', async () => {
  const realFetch = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.endsWith('/models')) return json({ data: [{ id: 'free/model:free', pricing: { prompt: '0', completion: '0' } }] })
    if (url.includes('chat/completions'))
      return chat({
        destination: 'Taipei, Taiwan',
        days: [
          { index: 1, theme: 'Old river port', zones: [{ name: 'Dadaocheng', query: 'Dadaocheng, Taipei, Taiwan', why: 'tea merchants' }, { name: 'Springfield', query: 'Springfield' }] },
          { index: 2, theme: 'Hot springs', zones: [{ name: 'Ignored', query: 'x' }] },
        ],
      })
    if (url.includes('photon')) {
      const far = url.includes('Springfield')
      return json({ features: [{ geometry: { coordinates: far ? [-89.65, 39.8] : [121.51, 25.06] } }] })
    }
    throw new Error('unexpected fetch ' + url)
  }) as typeof fetch
  try {
    const city = { name: 'Taipei', lat: 25.04, lon: 121.56 }
    const res = await agentRoute('outline', { ask: 'tea, old streets', pace: 'balanced', days: [{ index: 1, date: '2030-03-10', city, zones: [] }, { index: 2, date: '2030-03-11', city, zones: ['Beitou'] }] }, env, {})
    const { steps, end } = await read(res!)
    assert.equal(end.type, 'result', JSON.stringify(end))
    assert.deepEqual(end.result.days.map((d: { zones: { name: string }[] }) => d.zones.map((z) => z.name)), [['Dadaocheng'], []])
    assert.equal(end.result.days[1].theme, 'Hot springs')
    assert.ok(steps.some((s) => s.agent === 'Geocoder' && s.text.includes('Springfield')))
  } finally {
    globalThis.fetch = realFetch
  }
})
