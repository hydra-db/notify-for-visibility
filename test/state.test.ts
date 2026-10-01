import assert from 'node:assert/strict'
import { test } from 'node:test'
import { marker, readSent, type Sent } from '../src/state.ts'

test('round-trips sent triples through the marker', () => {
  const sent: Sent[] = [['go-ash', 'tushar', 'github'], ['odd --> name', 'x', 'slack']]
  const m = marker(sent)
  assert.ok(!m.slice(4, -3).includes('-->'))
  assert.deepEqual(readSent(`${m}\nbody`), sent)
})

test('ignores comments without the marker', () => {
  assert.deepEqual(readSent('just a comment'), [])
  assert.deepEqual(readSent(undefined), [])
  assert.deepEqual(readSent('<!-- notify-for-visibility {broken} -->'), [])
})
