import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import type { AstGrepRule } from '../src/config.ts'
import { changedCount, matchFiles } from '../src/match/astgrep.ts'
import { installAstGrep, PINNED_VERSION } from '../src/match/astgrep-install.ts'

test('changedCount compares snippets as a multiset', () => {
  assert.equal(changedCount(['a', 'b'], ['b', 'a']), 0)
  assert.equal(changedCount(['a'], ['a', 'a']), 1)
  assert.equal(changedCount(['a'], ['b']), 2)
  assert.equal(changedCount([], ['a']), 1)
})

// On a runner this goes through the real download and checksum. Locally it
// uses ast-grep from PATH, or skips.
async function binary(): Promise<string | undefined> {
  if (process.env.RUNNER_TOOL_CACHE) return installAstGrep(PINNED_VERSION)
  try {
    execFileSync('ast-grep', ['--version'])
    return 'ast-grep'
  } catch {
    return undefined
  }
}

const rule: AstGrepRule = {
  language: 'go',
  rule: { any: [{ kind: 'interpreted_string_literal' }, { kind: 'raw_string_literal' }], regex: '\\b(MATCH|MERGE)\\b' },
}

const base = 'package x\n\nvar q = "MATCH (n) RETURN n"\n'

test('ast-grep matches only real changes to matched code', async t => {
  const bin = await binary()
  if (!bin) return t.skip('ast-grep not installed')
  const cases: [string, string | undefined, string | undefined, number | undefined][] = [
    ['comment-only edit', base, `${base}// MATCH in a comment\n`, undefined],
    ['code moved down', base, `package x\n\nvar unrelated = 1\n\nvar q = "MATCH (n) RETURN n"\n`, undefined],
    ['literal edited', base, base.replace('RETURN n', 'RETURN n.id'), 2],
    ['raw literal added', base, `${base}var r = \`MERGE (m)\`\n`, 1],
    ['file added', undefined, base, 1],
    ['file removed', base, undefined, 1],
  ]
  for (const [name, b, h, want] of cases) {
    const workdir = await mkdtemp(join(tmpdir(), 'nfv-test-'))
    const status = b === undefined ? 'added' : h === undefined ? 'removed' : 'modified'
    const hits = await matchFiles(bin, rule, [{ filename: '.hidden/pkg/q.go', status }], new Map([['.hidden/pkg/q.go', { base: b, head: h }]]), workdir)
    assert.equal(hits[0]?.changed, want, name)
  }
})

test('rename compares against the old file', async t => {
  const bin = await binary()
  if (!bin) return t.skip('ast-grep not installed')
  const workdir = await mkdtemp(join(tmpdir(), 'nfv-test-'))
  const files = [{ filename: 'new/q.go', previous_filename: 'old/q.go', status: 'renamed' as const }]
  const hits = await matchFiles(bin, rule, files, new Map([['new/q.go', { base, head: base }]]), workdir)
  assert.deepEqual(hits, [])
})
