import { posix } from 'node:path'

export interface ChangedFile {
  filename: string
  status: 'added' | 'removed' | 'modified' | 'renamed' | 'copied' | 'changed' | 'unchanged'
  previous_filename?: string
}

// A renamed file matches on either name, so moving code out of a watched
// directory is still a change to that directory.
export function filterByPaths(files: ChangedFile[], globs: string[]): ChangedFile[] {
  return files.filter(f => {
    const names = f.previous_filename ? [f.filename, f.previous_filename] : [f.filename]
    return names.some(name => globs.some(g => posix.matchesGlob(name, g)))
  })
}
