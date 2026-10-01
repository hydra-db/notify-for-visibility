import { Ajv } from 'ajv'
import { parse } from 'yaml'
import schema from '../schema/config.schema.json' with { type: 'json' }

export type Channel = 'github' | 'slack'

export interface Person {
  github: string
  slack?: string
}

export interface AstGrepRule {
  language: string
  rule: Record<string, unknown>
  constraints?: Record<string, unknown>
  utils?: Record<string, unknown>
  transform?: Record<string, unknown>
}

export interface ChangeMatcher {
  paths: string[]
  'ast-grep'?: AstGrepRule
}

export interface Notify {
  person: string
  via: Channel[]
  comment?: string
}

export interface Rule {
  name: string
  change: ChangeMatcher[]
  notify: Notify[]
}

export interface Config {
  people: Record<string, Person>
  slack?: { channel: string }
  'ignore-drafts': boolean
  rules: Rule[]
}

export class ConfigError extends Error {}

const validate = new Ajv({ allErrors: true, useDefaults: true }).compile<Config>(schema)

export function parseConfig(text: string, source: string): Config {
  let raw: unknown
  try {
    raw = parse(text)
  } catch (err) {
    throw new ConfigError(`${source}: invalid YAML: ${(err as Error).message}`)
  }
  if (!validate(raw)) {
    const problems = (validate.errors ?? []).map(e => `  ${e.instancePath || '/'} ${e.message}`)
    throw new ConfigError(`${source}: invalid config:\n${problems.join('\n')}`)
  }
  const config = raw
  const problems: string[] = []
  const seen = new Set<string>()
  config.rules.forEach((rule, i) => {
    if (seen.has(rule.name)) problems.push(`  /rules/${i}/name "${rule.name}" is used by more than one rule`)
    seen.add(rule.name)
    rule.notify.forEach((n, j) => {
      if (!(n.person in config.people)) {
        problems.push(`  /rules/${i}/notify/${j}/person "${n.person}" is not in people`)
      }
      if (n.via.includes('slack') && !config.slack) {
        problems.push(`  /rules/${i}/notify/${j}/via uses slack but slack.channel is not set`)
      }
    })
  })
  if (problems.length > 0) throw new ConfigError(`${source}: invalid config:\n${problems.join('\n')}`)
  return config
}
