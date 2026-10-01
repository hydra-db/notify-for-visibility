import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Rule } from '../src/config.ts'
import { renderComment, renderSlack, type Delivery } from '../src/render.ts'
import { readSent } from '../src/state.ts'

const people = { tushar: { github: 'tushar-hydradb', slack: 'U0123' }, kim: { github: 'kim' } }
const pr = { owner: 'hydra-db', repo: 'app', number: 7, title: 'Add <graph> & stuff', url: 'https://github.com/hydra-db/app/pull/7' }
const rule: Rule = { name: 'graph-queries', change: [{ paths: ['**/*.go'] }], notify: [] }
const d: Delivery = {
  rule,
  files: [{ filename: 'pkg/store.go', changed: 2 }],
  github: [{ person: 'tushar', via: ['github'], comment: 'Check index usage.' }, { person: 'kim', via: ['github'] }],
  slack: [{ person: 'kim', via: ['slack'] }],
}

test('comment mentions people with their comment and carries state', () => {
  const body = renderComment([d], [['graph-queries', 'tushar', 'github']], people, pr, '.github/n.yml')
  assert.match(body, /^@tushar-hydradb Check index usage\.$/m)
  assert.match(body, /^@kim$/m)
  assert.match(body, /Sent to Slack: kim/)
  assert.match(body, /\(2 matches changed\)/)
  assert.match(body, /pull\/7\/files#diff-[0-9a-f]{64}\)/)
  assert.deepEqual(readSent(body), [['graph-queries', 'tushar', 'github']])
})

test('slack escapes text and falls back to a name without an ID', () => {
  const text = renderSlack({ ...d, slack: [{ person: 'tushar', via: ['slack'], comment: 'a < b' }, { person: 'kim', via: ['slack'] }] }, people, pr)
  assert.match(text, /Add &lt;graph&gt; &amp; stuff/)
  assert.match(text, /^<@U0123> a &lt; b$/m)
  assert.match(text, /^kim$/m)
})
