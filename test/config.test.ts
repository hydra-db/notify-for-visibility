import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ConfigError, parseConfig } from '../src/config.ts'

const good = `
people:
  tushar: { github: tushar-hydradb, slack: U0123 }
slack: { channel: C0789 }
rules:
  - name: go-ash
    change:
      - paths: ["goash/**"]
    notify:
      - person: tushar
        via: [github, slack]
        comment: Heads up
`

test('parses a valid config and fills defaults', () => {
  const c = parseConfig(good, 'cfg')
  assert.equal(c['ignore-drafts'], true)
  assert.equal(c.rules[0].notify[0].comment, 'Heads up')
})

test('rejects an unknown person', () => {
  assert.throws(() => parseConfig(good.replace('person: tushar', 'person: nobody'), 'cfg'), /notify\/0\/person "nobody" is not in people/)
})

test('rejects slack without a channel', () => {
  assert.throws(() => parseConfig(good.replace('slack: { channel: C0789 }\n', ''), 'cfg'), /uses slack but slack.channel is not set/)
})

test('rejects duplicate rule names', () => {
  const dup = good + good.slice(good.indexOf('  - name')).replace(/^/, '')
  assert.throws(() => parseConfig(dup, 'cfg'), /used by more than one rule/)
})

test('reports schema errors with their path', () => {
  assert.throws(
    () => parseConfig(good.replace('via: [github, slack]', 'via: [email]'), 'cfg'),
    (err: unknown) => err instanceof ConfigError && /\/rules\/0\/notify\/0\/via\/0/.test(err.message),
  )
})

test('rejects broken YAML', () => {
  assert.throws(() => parseConfig('people: [', 'cfg'), /invalid YAML/)
})
