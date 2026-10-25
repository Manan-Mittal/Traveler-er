import test from 'node:test'
import assert from 'node:assert/strict'
import { isHyped, verifyPicks, type Candidate } from './verify.ts'

const c = (name: string): Candidate => ({ id: name, name, lat: 0, lon: 0, category: 'food', source: 'osm' })

test('drops invented places and duplicates', () => {
  const out = verifyPicks(
    [
      { name: 'Lao Zhang Beef Noodles', why: 'a' },
      { name: 'lao zhang beef noodles', why: 'dup' },
      { name: 'Made Up Cafe', why: 'b' },
    ],
    [c('Lao Zhang Beef Noodles'), c('Other')],
  )
  assert.equal(out.length, 1)
  assert.equal(out[0].candidate.name, 'Lao Zhang Beef Noodles')
})

test('matches ignoring accents and partial names', () => {
  const out = verifyPicks([{ name: 'Cafe Zoe', why: 'x' }], [c('Café Zoé Roasters')])
  assert.equal(out.length, 1)
})

test('flags chains and hype wording', () => {
  assert.equal(isHyped('Starbucks Reserve'), true)
  assert.equal(isHyped('Most Instagrammable Wall'), true)
  assert.equal(isHyped('Old Tea House'), false)
})
