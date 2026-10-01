import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as core from '@actions/core'
import { context, getOctokit } from '@actions/github'
import { ConfigError, parseConfig } from './config.ts'
import { createComment, getContent, listFiles, MAX_PR_FILES, readPreviouslySent } from './github.ts'
import type { FileContents } from './match/astgrep.ts'
import { installAstGrep, PINNED_VERSION } from './match/astgrep-install.ts'
import { postSlack } from './notify/slack.ts'
import { type PullRequest, renderComment, renderSlack } from './render.ts'
import { evaluate, type Io, plan } from './run.ts'
import type { Sent } from './state.ts'

interface PullRequestPayload {
  number: number
  title: string
  html_url: string
  draft?: boolean
  base: { sha: string }
  head: { sha: string }
}

async function run(): Promise<void> {
  const payload = context.payload.pull_request as PullRequestPayload | undefined
  if (!payload) {
    core.warning(`notify-for-visibility runs on pull_request or pull_request_target, not ${context.eventName}. Skipping.`)
    return
  }

  const octokit = getOctokit(core.getInput('github-token', { required: true }))
  const repo = context.repo
  const configPath = core.getInput('config-path') || '.github/notify-for-visibility.yml'

  // Read from the base commit so a PR cannot change the rules it is checked against.
  const configText = await getContent(octokit, repo, configPath, payload.base.sha)
  if (configText === undefined) {
    throw new ConfigError(`${configPath} not found on the base branch at ${payload.base.sha}`)
  }
  const config = parseConfig(configText, configPath)

  if (payload.draft && config['ignore-drafts']) {
    core.info('Draft PR, skipping. It is checked again once marked ready for review.')
    return
  }

  const files = await listFiles(octokit, repo, payload.number)
  if (files.length >= MAX_PR_FILES) {
    core.warning(`This PR changes at least ${MAX_PR_FILES} files, the most GitHub lists. Files beyond that are not checked.`)
  }

  const cache = new Map<string, FileContents>()
  let binary: Promise<string> | undefined
  let workdir: Promise<string> | undefined
  const io: Io = {
    async contents(wanted) {
      await Promise.all(
        wanted
          .filter(f => !cache.has(f.filename))
          .map(async f => {
            const hasBase = f.status !== 'added' && f.status !== 'copied'
            const [base, head] = await Promise.all([
              hasBase ? getContent(octokit, repo, f.previous_filename ?? f.filename, payload.base.sha) : undefined,
              f.status !== 'removed' ? getContent(octokit, repo, f.filename, payload.head.sha) : undefined,
            ])
            cache.set(f.filename, { base, head })
          }),
      )
      return cache
    },
    astGrep: () => (binary ??= installAstGrep(core.getInput('ast-grep-version') || PINNED_VERSION)),
    workdir: () => (workdir ??= mkdtemp(join(process.env.RUNNER_TEMP || tmpdir(), 'notify-for-visibility-'))),
  }

  const fired = await evaluate(config, files, io)
  core.setOutput('matched-rules', JSON.stringify(fired.map(f => f.rule.name)))
  if (fired.length === 0) {
    core.info('No rule matched.')
    return
  }
  core.info(`Matched: ${fired.map(f => f.rule.name).join(', ')}`)

  const deliveries = plan(fired, await readPreviouslySent(octokit, repo, payload.number))
  if (deliveries.length === 0) {
    core.info('Everyone was already notified on this PR.')
    return
  }

  const pr: PullRequest = { ...repo, number: payload.number, title: payload.title, url: payload.html_url }
  const sent: Sent[] = []
  const failures: string[] = []
  const slackToken = core.getInput('slack-token')

  for (const d of deliveries) {
    if (d.slack.length === 0) continue
    if (!slackToken) {
      core.warning(`${d.rule.name}: slack-token is not set, skipping Slack for ${d.slack.map(n => n.person).join(', ')}`)
      d.slack = []
      continue
    }
    for (const n of d.slack) {
      if (!config.people[n.person].slack) core.warning(`${n.person} has no slack ID, so Slack shows their name without a mention`)
    }
    try {
      // slack.channel is guaranteed by config validation whenever any notify uses slack.
      await postSlack(slackToken, config.slack!.channel, renderSlack(d, config.people, pr))
      for (const n of d.slack) sent.push([d.rule.name, n.person, 'slack'])
    } catch (err) {
      failures.push(`${d.rule.name}: ${(err as Error).message}`)
      d.slack = []
    }
  }
  for (const d of deliveries) for (const n of d.github) sent.push([d.rule.name, n.person, 'github'])

  const shown = deliveries.filter(d => d.github.length > 0 || d.slack.length > 0)
  // Always a new comment: GitHub does not notify people @-mentioned by an edit.
  if (shown.length > 0) {
    await createComment(octokit, repo, payload.number, renderComment(shown, sent, config.people, pr, configPath))
  }
  if (failures.length > 0) throw new Error(failures.join('\n'))
}

run().catch(err => core.setFailed(err instanceof Error ? err.message : String(err)))
