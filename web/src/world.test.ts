import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { countryAt, summarize, toCountries } from './world.ts'
import type { Trip } from './types.ts'

const countries = toCountries(JSON.parse(readFileSync(new URL('../public/countries.json', import.meta.url), 'utf8')))
const at = (lon: number, lat: number) => countryAt(countries, lon, lat)?.id

test('countryAt finds the country, including small ones and points just off a simplified coast', () => {
  assert.equal(at(121.56, 25.03), 'TWN')
  assert.equal(at(2.35, 48.86), 'FRA')
  assert.equal(at(103.85, 1.29), 'SGP')
  assert.equal(at(114.17, 22.29), 'HKG')
  assert.equal(at(-157.86, 21.31), 'USA')
  assert.equal(at(14.51, 35.9), 'MLT')
  assert.equal(at(-30, 30), undefined)
})

const trip = (id: string, start: string, end: string, days: { date: string; lon: number; lat: number }[]): Trip => ({
  id,
  name: id,
  startDate: start,
  endDate: end,
  cities: [{ id: 'c1', name: 'Taipei', lat: 25.03, lon: 121.56 }],
  days: days.map((d, i) => ({ id: `d${i}`, date: d.date, title: '', zones: [], notes: '', cityId: 'c1', stops: [{ id: `s${i}`, name: 'x', lat: d.lat, lon: d.lon, category: 'sight', notes: '', source: 'user' }] })),
  inbox: [],
  bookings: [],
  createdAt: 0,
  updatedAt: 0,
})

test('summarize counts past trip days, hand marks and removals', () => {
  const trips = [
    trip('Taiwan', '2026-01-01', '2026-01-02', [{ date: '2026-01-01', lon: 121.56, lat: 25.03 }]),
    trip('Future', '2027-05-01', '2027-05-02', [{ date: '2027-05-01', lon: 139.7, lat: 35.7 }]),
  ]
  const s = summarize(countries, trips, { countries: ['FRA'], removed: [], cities: [], updatedAt: 1 }, '2026-10-25')
  assert.deepEqual([...s.countries.keys()].sort(), ['FRA', 'TWN'])
  assert.deepEqual(s.countries.get('TWN'), ['Taiwan'])
  assert.deepEqual([...s.continents].sort(), ['Asia', 'Europe'])
  assert.equal(s.cities.length, 1)
  assert.ok(s.landPct > 0.3 && s.landPct < 0.5, String(s.landPct))

  const hidden = summarize(countries, trips, { countries: [], removed: ['TWN'], cities: [], updatedAt: 1 }, '2026-10-25')
  assert.equal(hidden.countries.size, 0)
})
