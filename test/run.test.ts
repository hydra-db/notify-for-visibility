import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Config } from '../src/config.ts'
import { evaluate, type Io, loadRulesText, plan } from '../src/run.ts'

const config: Config = {
  people: { a: { github: 'a' }, b: { github: 'b', slack: 'U1' } },
  slack: { channel: 'C1' },
  'ignore-drafts': true,
  rules: [
    {
      name: 'r1',
      change: [{ paths: ['goash/**'] }],
      notify: [{ person: 'a', via: ['github'] }, { person: 'b', via: ['github', 'slack'] }],
    },
    { name: 'r2', change: [{ paths: ['docs/**'] }], notify: [{ person: 'a', via: ['github'] }] },
  ],
}

const io: Io = {
  contents: () => Promise.reject(new Error('not used')),
  astGrep: () => Promise.reject(new Error('not used')),
  workdir: () => Promise.reject(new Error('not used')),
}

test('fires only rules whose paths changed, without touching ast-grep', async () => {
  const fired = await evaluate(config, [{ filename: 'goash/x.go', status: 'modified' }], io)
  assert.deepEqual(fired.map(f => [f.rule.name, f.files.map(x => x.filename)]), [['r1', ['goash/x.go']]])
})

test('plan skips what was already sent', async () => {
  const fired = await evaluate(config, [{ filename: 'goash/x.go', status: 'modified' }], io)
  const [d] = plan(fired, [['r1', 'a', 'github'], ['r1', 'b', 'slack']], config.people, 'someone')
  assert.deepEqual(d.github.map(n => n.person), ['b'])
  assert.deepEqual(d.slack, [])
  assert.deepEqual(plan(fired, [['r1', 'a', 'github'], ['r1', 'b', 'github'], ['r1', 'b', 'slack']], config.people, 'someone'), [])
})

test('plan never notifies the PR author', async () => {
  const fired = await evaluate(config, [{ filename: 'goash/x.go', status: 'modified' }], io)
  const [d] = plan(fired, [], config.people, 'B')
  assert.deepEqual(d.github.map(n => n.person), ['a'])
  assert.deepEqual(d.slack, [])
})

test('rules load from the base, skip when only the PR adds them, fail when nowhere', async () => {
  const at = (files: Record<string, string>) => (ref: string) => Promise.resolve(files[ref])
  assert.deepEqual(await loadRulesText(at({ base: 'b', head: 'h' }), 'cfg', 'base', 'head'), { text: 'b' })
  const skipped = await loadRulesText(at({ head: 'h' }), 'cfg', 'base', 'head')
  assert.ok('skip' in skipped && skipped.skip.includes('not on the base branch yet'))
  await assert.rejects(loadRulesText(at({}), 'cfg', 'base', 'head'), /not found on the base branch or in this PR/)
})
