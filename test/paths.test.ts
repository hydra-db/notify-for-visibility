import assert from 'node:assert/strict'
import { test } from 'node:test'
import { filterByPaths } from '../src/match/paths.ts'

test('matches globs against changed paths', () => {
  const files = [
    { filename: 'goash/stage/run.go', status: 'modified' as const },
    { filename: 'api/main.go', status: 'modified' as const },
  ]
  assert.deepEqual(filterByPaths(files, ['goash/**']).map(f => f.filename), ['goash/stage/run.go'])
})

test('a rename matches on its old name too', () => {
  const files = [{ filename: 'lib/run.go', previous_filename: 'goash/run.go', status: 'renamed' as const }]
  assert.equal(filterByPaths(files, ['goash/**']).length, 1)
})
