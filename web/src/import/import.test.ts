import { test } from 'node:test'
import assert from 'node:assert/strict'
import { coordsFromUrl, listNameOf, parseCsv, parseListCsv, parseSavedPlacesJson, parseTakeoutFile } from './takeout.ts'
import { cityFor, flag, groupPlaces, isDuplicate, type ResolvedPlace } from './group.ts'

test('parseCsv handles quotes, escaped quotes, CRLF and newlines in fields', () => {
  assert.deepEqual(parseCsv('a,"b, c","say ""hi"""\r\n"multi\nline",x,\n'), [
    ['a', 'b, c', 'say "hi"'],
    ['multi\nline', 'x', ''],
  ])
  assert.deepEqual(parseCsv('﻿Title\nA'), [['Title'], ['A']])
})

test('coordsFromUrl reads the URL shapes that carry coordinates', () => {
  assert.deepEqual(coordsFromUrl('https://www.google.com/maps/search/Elephant+Mountain/@25.0271,121.5766,17z'), { lat: 25.0271, lon: 121.5766 })
  assert.deepEqual(coordsFromUrl('https://www.google.com/maps/place/X/data=!4m6!3m5!1s0x0:0x1!8m2!3d41.8827!4d-87.6233'), { lat: 41.8827, lon: -87.6233 })
  assert.deepEqual(coordsFromUrl('https://maps.google.com/?q=25.03,121.56'), { lat: 25.03, lon: 121.56 })
  assert.equal(coordsFromUrl('https://www.google.com/maps/place/Din+Tai+Fung/data=!4m2!3m1!1s0x3442abb6da9c9e1f:0x1206bcf082fd10a6'), undefined)
  assert.equal(coordsFromUrl('https://maps.google.com/?q=0.0,0.0'), undefined)
})

test('parseListCsv reads a Takeout Saved list, skipping the blank row', () => {
  const csv = [
    'Title,Note,URL,Tags,Comment',
    ',,,,',
    'Din Tai Fung Xinyi,"Order the ""truffle"" dumplings",https://www.google.com/maps/place/Din+Tai+Fung/data=!4m2!3m1!1s0x3442abb6da9c9e1f:0x1206bcf082fd10a6,,go early',
    'Elephant Mountain,,"https://www.google.com/maps/search/Elephant+Mountain/@25.0271,121.5766,17z",,',
    ',orphan note,,,',
  ].join('\n')
  const places = parseListCsv(csv, 'Taiwan')
  assert.equal(places.length, 2)
  assert.deepEqual(places[0], {
    name: 'Din Tai Fung Xinyi',
    listName: 'Taiwan',
    note: 'Order the "truffle" dumplings · go early',
    url: 'https://www.google.com/maps/place/Din+Tai+Fung/data=!4m2!3m1!1s0x3442abb6da9c9e1f:0x1206bcf082fd10a6',
  })
  assert.equal(places[1].lat, 25.0271)
  assert.equal(places[1].lon, 121.5766)
  assert.throws(() => parseListCsv('foo,bar\n1,2', 'Bad'), /not a Google Maps list/)
})

test('parseSavedPlacesJson reads old and new starred-place formats', () => {
  const json = JSON.stringify({
    type: 'FeatureCollection',
    features: [
      { geometry: { coordinates: [-87.6233, 41.8827], type: 'Point' }, properties: { Title: 'Cloud Gate', 'Google Maps URL': 'http://maps.google.com/?cid=1' } },
      {
        geometry: { coordinates: [0, 0], type: 'Point' },
        properties: { google_maps_url: 'http://maps.google.com/?cid=2', location: { name: 'Raohe Night Market', address: 'Raohe St, Songshan District, Taipei', country_code: 'TW' }, Comment: 'pepper buns' },
      },
      { geometry: { coordinates: [1, 1] }, properties: {} },
    ],
  })
  const places = parseSavedPlacesJson(json, 'Starred places')
  assert.equal(places.length, 2)
  assert.deepEqual(places[0], { name: 'Cloud Gate', listName: 'Starred places', note: '', url: 'http://maps.google.com/?cid=1', address: undefined, lat: 41.8827, lon: -87.6233 })
  assert.equal(places[1].lat, undefined)
  assert.equal(places[1].address, 'Raohe St, Songshan District, Taipei')
  assert.equal(places[1].note, 'pepper buns')
})

test('parseTakeoutFile picks the parser by extension and names lists after files', () => {
  assert.equal(listNameOf('Takeout/Saved/Chicago eats.csv'), 'Chicago eats')
  assert.equal(parseTakeoutFile('Takeout/Saved/Chicago eats.csv', 'Title,Note,URL\nAu Cheval,,')![0].listName, 'Chicago eats')
  assert.equal(parseTakeoutFile('Saved Places.json', '{"type":"FeatureCollection","features":[{"geometry":{"coordinates":[1,2]},"properties":{"Title":"X"}}]}')![0].listName, 'Starred places')
  assert.equal(parseTakeoutFile('notes.json', '{"hello":1}'), null)
  assert.equal(parseTakeoutFile('archive_browser.html', '<html>'), null)
})

const place = (name: string, city: string, country: string, countryCode: string, lat: number, lon: number): ResolvedPlace => ({
  name, city, country, countryCode, lat, lon, listName: 'L', note: '', category: 'other',
})

test('groupPlaces groups by country then city, biggest first', () => {
  const groups = groupPlaces([
    place('Au Cheval', 'Chicago', 'United States', 'us', 41.88, -87.65),
    place('Taipei 101', 'Taipei', 'Taiwan', 'tw', 25.03, 121.56),
    place('Raohe', 'Taipei', 'Taiwan', 'tw', 25.05, 121.58),
    place('Chikan Tower', 'Tainan', 'Taiwan', 'tw', 23.0, 120.2),
  ])
  assert.deepEqual(groups.map((g) => [g.country, g.count]), [['Taiwan', 3], ['United States', 1]])
  assert.deepEqual(groups[0].cities.map((c) => [c.name, c.places.length]), [['Taipei', 2], ['Tainan', 1]])
  assert.ok(Math.abs(groups[0].cities[0].lat - 25.04) < 1e-9)
})

test('cityFor matches by name, then nearest within 80 km', () => {
  const cities = [{ id: 'tpe', name: 'Taipei', lat: 25.04, lon: 121.56 }, { id: 'tnn', name: 'Tainan', lat: 23.0, lon: 120.2 }]
  assert.equal(cityFor({ city: 'taipei', lat: 0, lon: 0 }, cities)?.id, 'tpe')
  assert.equal(cityFor({ city: 'New Taipei', lat: 25.01, lon: 121.46 }, cities)?.id, 'tpe')
  assert.equal(cityFor({ city: 'Hualien', lat: 23.98, lon: 121.6 }, cities), undefined)
})

test('isDuplicate needs the same name close by', () => {
  const have = [{ name: 'Taipei 101', lat: 25.0339, lon: 121.5645 }]
  assert.ok(isDuplicate({ name: 'taipei 101', lat: 25.034, lon: 121.5646 }, have))
  assert.ok(!isDuplicate({ name: 'Taipei 101', lat: 25.1, lon: 121.5645 }, have))
  assert.ok(!isDuplicate({ name: 'Din Tai Fung', lat: 25.0339, lon: 121.5645 }, have))
})

test('flag builds emoji from country codes', () => {
  assert.equal(flag('tw'), '🇹🇼')
  assert.equal(flag(''), '🌍')
})
