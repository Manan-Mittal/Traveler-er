import test from 'node:test'
import assert from 'node:assert/strict'
import { parseListings, type Place, type Zone } from './scout.ts'
import { shortlist, picksFor } from './curator.ts'
import { ground, pace } from './critic.ts'
import { bookingsFor } from './logistics.ts'
import { estimate, fromItineraries, type Leg } from './travel.ts'
import { bookBy } from './run.ts'

const zone = (key: string, dayIndex = 1, lat = 25.05, lon = 121.51): Zone => ({ key, dayIndex, date: '2026-11-10', name: key, lat, lon, walkMinutes: 30 })
const place = (id: string, extra: Partial<Place> = {}): Place => ({ id, zoneKey: 'a', name: id, lat: 25.05, lon: 121.51, category: 'food', source: 'osm', tags: {}, ...extra })

test('reads Wikivoyage listings with coordinates and strips markup', () => {
  const wt = `==Eat==
* {{eat | name=[[Lin's]] Tea House | lat=25.05 | long=121.51 | content=Run by the same family since 1934, ''excellent'' oolong. }}
* {{see | name=No Coords Temple | content=Nice. }}`
  const out = parseListings(wt)
  assert.equal(out.length, 1)
  assert.equal(out[0].name, "Lin's Tea House")
  assert.equal(out[0].content, 'Run by the same family since 1934, excellent oolong.')
})

test('shortlist rotates categories and pushes world-famous places down', () => {
  const ps = [
    place('famous', { category: 'sight', fame: 90 }),
    place('quiet', { category: 'sight', fame: 2 }),
    place('noodles'),
    place('dumplings'),
    place('tea', { category: 'cafe', guide: 'loved by locals' }),
  ]
  const out = shortlist(ps, '', 3).map((p) => p.id)
  assert.deepEqual(new Set(out), new Set(['quiet', 'tea', 'noodles']))
})

test('pick counts follow pace and split across zones', () => {
  assert.equal(picksFor('balanced', 1), 6)
  assert.equal(picksFor('balanced', 2), 3)
  assert.equal(picksFor('relaxed', 3), 2)
})

test('critic drops invented, misplaced, duplicate and world-famous picks', () => {
  const a = zone('a')
  const b = zone('b')
  const ids = new Map([
    ['c1', place('Lin Tea')],
    ['c2', place('Other Zone', { zoneKey: 'b' })],
    ['c3', place('Already Planned')],
    ['c4', place('Big Temple', { fame: 80, category: 'sight' })],
  ])
  const labels = new Map([['Z1', a], ['Z2', b]])
  const picks = ['c1', 'c1', 'c2', 'c3', 'c4', 'c99'].map((id) => ({ zone: 'Z1', id, why: 'x', book: 'none' as const }))
  const { accepted, rejected } = ground(picks, ids, labels, ['already planned'], 'quiet tea')
  assert.deepEqual(accepted.get('a')?.map((x) => x.place.name), ['Lin Tea'])
  assert.deepEqual(rejected.map((r) => r.reason.split(' (')[0]), ['already in the trip or picked twice', 'belongs to a different neighborhood', 'already in the trip or picked twice', 'world-famous', 'not in the scouted list'])
  // Asking for the classics lets famous places through.
  assert.equal(ground([{ zone: 'Z1', id: 'c4', why: '', book: 'none' }], ids, labels, [], 'first time, show me the classics').accepted.get('a')?.length, 1)
})

test('critic trims a day that runs past the pace budget but keeps two per zone', () => {
  const a = zone('a')
  const many = Array.from({ length: 9 }, (_, i) => ({ place: place(`p${i}`, { tags: { tourism: 'museum' } }), why: '', book: 'none' as const }))
  const accepted = new Map([['a', many]])
  const out = pace([a], accepted, 'relaxed')
  assert.ok(accepted.get('a')!.length < 9)
  assert.ok(accepted.get('a')!.length >= 2)
  assert.ok(out.days[0].minutes <= 360)
  assert.equal(out.rejected[0].reason, 'trimmed so day 1 fits a relaxed pace')
})

test('logistics books required tables a week ahead and never in the past', () => {
  const z = zone('a')
  const out = bookingsFor(z, [
    { place: place('Chef Table', { tags: { reservation: 'required' } }), why: '', book: 'none' },
    { place: place('Old Museum', { category: 'sight' }), why: '', book: 'ticket' },
    { place: place('Noodle Stall'), why: '', book: 'none' },
  ], '2026-10-01')
  assert.deepEqual(out.map((b) => [b.title, b.kind, b.deadline]), [
    ['Reserve Chef Table', 'restaurant', '2026-11-03'],
    ['Tickets for Old Museum', 'ticket', '2026-11-07'],
  ])
  assert.equal(bookBy('2026-11-10', 42, '2026-11-01'), '2026-11-01')
})

const leg: Leg = { dayIndex: 4, date: '2026-11-12', fromName: 'Taipei', fromLat: 25.048, fromLon: 121.517, toName: 'Kaohsiung', toLat: 22.687, toLon: 120.307 }

test('travel names high-speed rail from a Transitous itinerary', () => {
  const plan = fromItineraries(leg, [
    { duration: 5 * 3600, transfers: 0, legs: [{ mode: 'REGIONAL_RAIL', displayName: 'Tze-Chiang 105' }] },
    { duration: 6000, transfers: 1, legs: [{ mode: 'WALK' }, { mode: 'SUBWAY', routeShortName: 'R' }, { mode: 'HIGHSPEED_RAIL', displayName: 'THSR 803' }] },
  ])!
  assert.equal(plan.mode, 'high-speed rail')
  assert.equal(plan.minutes, 100)
  assert.deepEqual(plan.lines, ['R', 'THSR 803'])
  assert.equal(plan.summary, 'High-speed rail · 1h 40m · 1 change')
})

test('travel falls back to a flight estimate for long hops with no timetable', () => {
  const far = estimate({ ...leg, toName: 'Tokyo', toLat: 35.68, toLon: 139.76 }, 2100)
  assert.equal(far.mode, 'flight')
  assert.equal(far.estimate, true)
  assert.equal(estimate(leg, 300).mode, 'drive')
})
