import type { Channel } from './config.ts'

// Every comment this action posts starts with this marker, carrying the
// (rule, person, channel) triples that comment notified. The union across
// all of them is what has already been sent on this PR.
const MARKER = /^<!-- notify-for-visibility (\{.*\}) -->/

export type Sent = [rule: string, person: string, channel: Channel]

export function key([rule, person, channel]: Sent): string {
  return JSON.stringify([rule, person, channel])
}

export function readSent(body: string | undefined): Sent[] {
  const m = body?.match(MARKER)
  if (!m) return []
  try {
    const parsed = JSON.parse(m[1]) as { sent?: unknown }
    return Array.isArray(parsed.sent) ? (parsed.sent as Sent[]) : []
  } catch {
    return []
  }
}

export function marker(sent: Sent[]): string {
  // Escape "-->" so a rule name cannot close the HTML comment early.
  return `<!-- notify-for-visibility ${JSON.stringify({ sent }).replaceAll('-->', '--\\u003e')} -->`
}
