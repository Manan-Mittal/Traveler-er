import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chunk, sourceOf } from './translate.ts'

test('picks the source language from the script', () => {
  assert.equal(sourceOf('台北車站', 'en'), 'zh-TW')
  assert.equal(sourceOf('しんじゅく', 'en'), 'ja')
  assert.equal(sourceOf('新宿駅', 'en'), 'zh-TW')
  assert.equal(sourceOf('서울역', 'fr'), 'ko')
  assert.equal(sourceOf('Москва', 'en'), 'ru')
})

test('leaves names alone that are already readable', () => {
  assert.equal(sourceOf('Taipei Main Station', 'en'), null)
  assert.equal(sourceOf('台北車站', 'zh-CN'), null)
  assert.equal(sourceOf('台北101 Taipei 101', 'en'), null)
  assert.equal(sourceOf('R22', 'en'), null)
})

test('chunks names under the byte cap', () => {
  const names = Array.from({ length: 40 }, (_, i) => `台北車站${i}`)
  const parts = chunk(names, 100)
  assert.deepEqual(parts.flat(), names)
  for (const p of parts) assert.ok(new TextEncoder().encode(p.join('\n')).length <= 100)
})
