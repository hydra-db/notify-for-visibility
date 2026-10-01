import { execFile } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { stringify } from 'yaml'
import type { AstGrepRule } from '../config.ts'
import type { ChangedFile } from './paths.ts'

const exec = promisify(execFile)

// Keeps the argv well under the OS limit when a PR touches many files.
const BATCH = 200

export interface FileContents {
  // Undefined when the file does not exist on that side (added or removed).
  base?: string
  head?: string
}

export interface AstGrepHit {
  filename: string
  changed: number
}

// Returns matched snippet text per file. Files with no match are absent.
export async function scan(binary: string, rule: AstGrepRule, files: string[]): Promise<Map<string, string[]>> {
  const inline = stringify({ id: 'notify-for-visibility', ...rule })
  const out = new Map<string, string[]>()
  for (let i = 0; i < files.length; i += BATCH) {
    const batch = files.slice(i, i + BATCH)
    const { stdout } = await exec(binary, ['scan', '--inline-rules', inline, '--json=stream', ...batch], {
      maxBuffer: 256 * 1024 * 1024,
    })
    for (const line of stdout.split('\n')) {
      if (line.trim() === '') continue
      const match = JSON.parse(line) as { file: string; text: string }
      const texts = out.get(match.file) ?? []
      texts.push(match.text)
      out.set(match.file, texts)
    }
  }
  return out
}

// Number of snippets present on one side and not the other, counted as a
// multiset. Line numbers are ignored, so code that only moved reads as 0.
export function changedCount(base: string[], head: string[]): number {
  const counts = new Map<string, number>()
  for (const t of base) counts.set(t, (counts.get(t) ?? 0) + 1)
  for (const t of head) counts.set(t, (counts.get(t) ?? 0) - 1)
  let changed = 0
  for (const c of counts.values()) changed += Math.abs(c)
  return changed
}

// Writes base and head copies under workdir, keeping each file's path (and
// so its extension, which ast-grep uses to pick a language), then compares
// the matches on each side.
export async function matchFiles(
  binary: string,
  rule: AstGrepRule,
  files: ChangedFile[],
  contents: Map<string, FileContents>,
  workdir: string,
): Promise<AstGrepHit[]> {
  const sides = { base: [] as string[], head: [] as string[] }
  const paths = new Map<string, { base?: string; head?: string }>()
  for (const f of files) {
    const c = contents.get(f.filename) ?? {}
    const entry: { base?: string; head?: string } = {}
    for (const side of ['base', 'head'] as const) {
      const text = c[side]
      if (text === undefined) continue
      const name = side === 'base' ? (f.previous_filename ?? f.filename) : f.filename
      const p = join(workdir, side, name)
      await mkdir(dirname(p), { recursive: true })
      await writeFile(p, text)
      sides[side].push(p)
      entry[side] = p
    }
    paths.set(f.filename, entry)
  }
  const [base, head] = await Promise.all([scan(binary, rule, sides.base), scan(binary, rule, sides.head)])
  const hits: AstGrepHit[] = []
  for (const f of files) {
    const p = paths.get(f.filename) ?? {}
    const changed = changedCount(
      (p.base && base.get(p.base)) || [],
      (p.head && head.get(p.head)) || [],
    )
    if (changed > 0) hits.push({ filename: f.filename, changed })
  }
  return hits
}
