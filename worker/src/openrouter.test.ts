import test from 'node:test'
import assert from 'node:assert/strict'
import { isFree } from './openrouter.ts'

test('accepts only :free models with every price at zero', () => {
  assert.equal(isFree({ id: 'meta/model:free', pricing: { prompt: '0', completion: '0', request: '0' } }), true)
  assert.equal(isFree({ id: 'meta/model', pricing: { prompt: '0', completion: '0' } }), false)
  assert.equal(isFree({ id: 'meta/model:free', pricing: { prompt: '0', completion: '0.000001' } }), false)
  assert.equal(isFree({ id: 'openrouter/auto', pricing: { prompt: '-1', completion: '-1' } }), false)
  assert.equal(isFree({ id: 'x:free' }), false)
})
