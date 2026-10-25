import test from 'node:test'
import assert from 'node:assert/strict'
import { getlistUrl, isShareLink, listRef, parseList } from './gmaps.ts'

test('only accepts https Google share links', () => {
  assert.ok(isShareLink('https://maps.app.goo.gl/AbC123xyz'))
  assert.ok(isShareLink(' https://www.google.com/maps/placelists/list/abc '))
  assert.ok(!isShareLink('http://maps.app.goo.gl/AbC123xyz'))
  assert.ok(!isShareLink('https://evil.example/maps.app.goo.gl'))
  assert.ok(!isShareLink('https://169.254.169.254/'))
  assert.ok(!isShareLink('not a url'))
})

test('finds the list id and token in redirect targets', () => {
  assert.deepEqual(
    listRef('https://www.google.com/maps/@25.03,121.56,12z/data=!4m3!11m2!2sAbCdEfGhIjKlMnOp_q-r!3e3?g_st=ic&token=XyZ-123'),
    { id: 'AbCdEfGhIjKlMnOp_q-r', token: 'XyZ-123' },
  )
  assert.deepEqual(listRef('https://www.google.com/maps/placelists/list/AbCdEfGhIjKl'), { id: 'AbCdEfGhIjKl', token: undefined })
  // EU consent interstitial wraps the real URL in continue=
  const consent = 'https://consent.google.com/m?continue=' + encodeURIComponent('https://www.google.com/maps/@/data=!4m3!11m2!2sAbCdEfGhIjKlMnOp!3e3?token=T1') + '&gl=DE'
  assert.deepEqual(listRef(consent), { id: 'AbCdEfGhIjKlMnOp', token: 'T1' })
  assert.equal(listRef('https://www.google.com/maps/place/Taipei+101'), null)
})

test('builds the getlist call around the list page', () => {
  const u = getlistUrl({ id: 'AbC', token: 'T' })
  assert.match(u, /^https:\/\/www\.google\.com\/maps\/preview\/entitylist\/getlist\?/)
  assert.ok(u.includes('!4i500'))
  assert.ok(u.includes(encodeURIComponent('https://www.google.com/maps/placelists/list/AbC?token=T')))
})

test('parses places out of a getlist response', () => {
  const place = (name: string, lat: number, lon: number, addr: string) => [null, [null, null, `${name}, ${addr}`, null, addr, [null, null, lat, lon], ['0x3442abb6da9c9e1f', '0x1206bcf082fd10a6'], 'ChIJ'], name]
  const body = ")]}'\n" + JSON.stringify([[null, null, null, null, 'Taiwan 2026', null, null, null, [
    place('Taipei 101', 25.0339, 121.5645, 'Xinyi District, Taipei'),
    place('Raohe Night Market', 25.0509, 121.5776, 'Songshan District, Taipei'),
    [null, [null, null, 'No coords']],
  ]]])
  const list = parseList(body)
  assert.equal(list.name, 'Taiwan 2026')
  assert.equal(list.places.length, 2)
  assert.deepEqual(list.places[0], { name: 'Taipei 101', address: 'Xinyi District, Taipei', lat: 25.0339, lon: 121.5645, url: 'https://www.google.com/maps?cid=1298933283718762662' })
  assert.throws(() => parseList('<html>sign in</html>'))
  assert.deepEqual(parseList(")]}'\n[[]]"), { name: 'Shared list', places: [] })
})
