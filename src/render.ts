import { createHash } from 'node:crypto'
import type { Notify, Person, Rule } from './config.ts'
import { marker, type Sent } from './state.ts'

export interface PullRequest {
  owner: string
  repo: string
  number: number
  title: string
  url: string
}

export interface MatchedFile {
  filename: string
  // Set when an ast-grep rule matched: how many snippets differ.
  changed?: number
}

// What one rule sends in this run. Targets already notified on a channel in
// an earlier run are left out of that channel's list.
export interface Delivery {
  rule: Rule
  files: MatchedFile[]
  github: Notify[]
  slack: Notify[]
}

const MAX_FILES = 20

function fileLink(pr: PullRequest, filename: string): string {
  // GitHub anchors each file in the PR diff by the SHA-256 of its path.
  const anchor = createHash('sha256').update(filename).digest('hex')
  return `${pr.url}/files#diff-${anchor}`
}

function changedNote(f: MatchedFile): string {
  if (f.changed === undefined) return ''
  return f.changed === 1 ? ' (1 match changed)' : ` (${f.changed} matches changed)`
}

function fileList<T>(files: MatchedFile[], line: (f: MatchedFile) => T): { lines: T[]; more: number } {
  return { lines: files.slice(0, MAX_FILES).map(line), more: Math.max(0, files.length - MAX_FILES) }
}

export function renderComment(
  deliveries: Delivery[],
  sent: Sent[],
  people: Record<string, Person>,
  pr: PullRequest,
  configPath: string,
): string {
  const sections = deliveries.map(d => {
    const { lines, more } = fileList(d.files, f => `- [\`${f.filename}\`](${fileLink(pr, f.filename)})${changedNote(f)}`)
    if (more > 0) lines.push(`- and ${more} more`)
    const out = [`**${d.rule.name}** matched this PR.`, '', ...lines, '']
    for (const n of d.github) {
      out.push(n.comment ? `@${people[n.person].github} ${n.comment}` : `@${people[n.person].github}`)
    }
    if (d.slack.length > 0) out.push(`Sent to Slack: ${d.slack.map(n => n.person).join(', ')}`)
    return out.join('\n')
  })
  return [
    marker(sent),
    sections.join('\n\n---\n\n'),
    '',
    `<sub>Sent by notify-for-visibility for visibility only, no action needed. Rules live in \`${configPath}\`.</sub>`,
  ].join('\n')
}

function slackEscape(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

export function renderSlack(d: Delivery, people: Record<string, Person>, pr: PullRequest): string {
  const prRef = `<${pr.url}|${slackEscape(`${pr.owner}/${pr.repo}#${pr.number}`)}>`
  const out = [`*${slackEscape(d.rule.name)}* matched ${prRef}: ${slackEscape(pr.title)}`]
  for (const n of d.slack) {
    const id = people[n.person].slack
    const who = id ? `<@${id}>` : slackEscape(n.person)
    out.push(n.comment ? `${who} ${slackEscape(n.comment)}` : who)
  }
  const { lines, more } = fileList(d.files, f => `• <${fileLink(pr, f.filename)}|${slackEscape(f.filename)}>${changedNote(f)}`)
  if (more > 0) lines.push(`• and ${more} more`)
  out.push(...lines)
  return out.join('\n')
}
