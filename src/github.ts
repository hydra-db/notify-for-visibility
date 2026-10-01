import type { getOctokit } from '@actions/github'
import type { ChangedFile } from './match/paths.ts'
import { readSent, type Sent } from './state.ts'

export type Octokit = ReturnType<typeof getOctokit>

export interface Repo {
  owner: string
  repo: string
}

// The files API stops at 3000 files per PR.
export const MAX_PR_FILES = 3000

export async function listFiles(octokit: Octokit, repo: Repo, pull_number: number): Promise<ChangedFile[]> {
  const files = await octokit.paginate(octokit.rest.pulls.listFiles, { ...repo, pull_number, per_page: 100 })
  return files.map(f => ({ filename: f.filename, status: f.status, previous_filename: f.previous_filename }))
}

// Reads a file at a commit. Undefined when it does not exist there. PR head
// commits from forks are readable from the base repo too.
export async function getContent(octokit: Octokit, repo: Repo, path: string, ref: string): Promise<string | undefined> {
  try {
    const res = await octokit.rest.repos.getContent({ ...repo, path, ref, mediaType: { format: 'raw' } })
    return res.data as unknown as string
  } catch (err) {
    if ((err as { status?: number }).status === 404) return undefined
    throw err
  }
}

// Union of what earlier runs sent, read from this action's own comments.
// Only bot-authored comments count, so a PR author cannot post a marker to
// suppress a notification.
export async function readPreviouslySent(octokit: Octokit, repo: Repo, issue_number: number): Promise<Sent[]> {
  const comments = await octokit.paginate(octokit.rest.issues.listComments, { ...repo, issue_number, per_page: 100 })
  return comments.filter(c => c.user?.type === 'Bot').flatMap(c => readSent(c.body))
}

export async function createComment(octokit: Octokit, repo: Repo, issue_number: number, body: string): Promise<void> {
  await octokit.rest.issues.createComment({ ...repo, issue_number, body })
}
