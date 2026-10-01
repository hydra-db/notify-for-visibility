import type { Config, Rule } from './config.ts'
import { type FileContents, matchFiles } from './match/astgrep.ts'
import { type ChangedFile, filterByPaths } from './match/paths.ts'
import type { Delivery, MatchedFile } from './render.ts'
import { key, type Sent } from './state.ts'

export interface Fired {
  rule: Rule
  files: MatchedFile[]
}

export interface Io {
  // Base and head contents for the given files, fetched only on first use.
  contents(files: ChangedFile[]): Promise<Map<string, FileContents>>
  astGrep(): Promise<string>
  workdir(): Promise<string>
}

export async function evaluate(config: Config, files: ChangedFile[], io: Io): Promise<Fired[]> {
  const fired: Fired[] = []
  for (const rule of config.rules) {
    const matched = new Map<string, MatchedFile>()
    for (const change of rule.change) {
      const candidates = filterByPaths(files, change.paths)
      if (candidates.length === 0) continue
      const ag = change['ast-grep']
      if (!ag) {
        for (const f of candidates) if (!matched.has(f.filename)) matched.set(f.filename, { filename: f.filename })
        continue
      }
      const hits = await matchFiles(await io.astGrep(), ag, candidates, await io.contents(candidates), await io.workdir())
      for (const h of hits) matched.set(h.filename, h)
    }
    if (matched.size > 0) fired.push({ rule, files: [...matched.values()] })
  }
  return fired
}

// Drops (rule, person, channel) triples already sent on this PR, and the PR's
// author, who already knows what they changed.
export function plan(fired: Fired[], previouslySent: Sent[], people: Config['people'], author: string): Delivery[] {
  const done = new Set(previouslySent.map(key))
  const isAuthor = (person: string) => people[person].github.toLowerCase() === author.toLowerCase()
  const deliveries: Delivery[] = []
  for (const { rule, files } of fired) {
    const pending = (channel: 'github' | 'slack') =>
      rule.notify.filter(
        n => n.via.includes(channel) && !isAuthor(n.person) && !done.has(key([rule.name, n.person, channel])),
      )
    const d = { rule, files, github: pending('github'), slack: pending('slack') }
    if (d.github.length > 0 || d.slack.length > 0) deliveries.push(d)
  }
  return deliveries
}
