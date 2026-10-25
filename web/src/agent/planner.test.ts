import test from 'node:test'
import assert from 'node:assert/strict'
import { fillBatches, planZones, travelLegs, type PlanZone } from './planner.ts'
import type { Trip } from '../types'

const trip: Trip = {
  id: 't', name: 'Taiwan', startDate: '2030-03-10', endDate: '2030-03-12', createdAt: 0, updatedAt: 0, inbox: [], bookings: [],
  cities: [
    { id: 'tpe', name: 'Taipei', lat: 25.04, lon: 121.56 },
    { id: 'khh', name: 'Kaohsiung', lat: 22.63, lon: 120.3 },
  ],
  days: [
    { id: 'd1', date: '2030-03-10', title: '', notes: '', cityId: 'tpe', zones: [{ id: 'z-full', name: 'Daan', lat: 25.03, lon: 121.54, walkMinutes: 30 }], stops: [
      { id: 's1', name: 'A', lat: 0, lon: 0, category: 'food', notes: '', source: 'user', zoneId: 'z-full' },
      { id: 's2', name: 'B', lat: 0, lon: 0, category: 'food', notes: '', source: 'user', zoneId: 'z-full' },
    ] },
    { id: 'd2', date: '2030-03-11', title: '', notes: '', cityId: 'tpe', zones: [{ id: 'z-empty', name: 'Beitou', lat: 25.13, lon: 121.5, walkMinutes: 30 }], stops: [] },
    { id: 'd3', date: '2030-03-12', title: '', notes: '', cityId: 'khh', zones: [], stops: [] },
  ],
}

test('plans the outline zones plus trip zones that still need places', () => {
  const zones = planZones(trip, { destination: 'Taiwan', days: [{ index: 3, theme: 'Port', zones: [{ name: 'Yancheng', lat: 22.62, lon: 120.28, walkMinutes: 30, why: 'old port' }] }] })
  assert.deepEqual(zones.map((z) => [z.key, z.dayIndex, z.existing]), [['z-empty', 2, true], ['new-3-0', 3, false]])
})

test('batches zones per city', () => {
  const z = (key: string, cityId?: string) => ({ key, cityId }) as PlanZone
  assert.deepEqual(fillBatches([z('a', 'x'), z('b', 'y'), z('c', 'x'), z('d', 'x')], 2).map((b) => b.map((x) => x.key)), [['a', 'c'], ['d'], ['b']])
})

test('adds a leg wherever the city changes, and flights in and out when given a home', () => {
  assert.deepEqual(travelLegs(trip, []).map((l) => [l.dayIndex, l.fromName, l.toName]), [[3, 'Taipei', 'Kaohsiung']])
  const legs = travelLegs(trip, [], { name: 'Toronto', lat: 43.65, lon: -79.38 })
  assert.deepEqual(legs.map((l) => [l.date, l.fromName, l.toName]), [
    ['2030-03-10', 'Toronto', 'Taipei'],
    ['2030-03-12', 'Taipei', 'Kaohsiung'],
    ['2030-03-12', 'Kaohsiung', 'Toronto'],
  ])
})
