import {readdirSync, realpathSync, statSync} from 'node:fs'
import {join, relative, resolve, sep} from 'node:path'

const SKIP_DIRECTORIES = new Set([
  '.git', '.hg', '.svn', '.idea', '.vscode', 'node_modules', 'vendor',
  '.venv', 'venv', 'env', 'dist', 'build', 'coverage', 'target',
])
const INTERESTING = /(^|\/)(?:package-lock\.json|yarn\.lock|pnpm-lock\.yaml|requirements[^/]*\.(?:txt|in)|poetry\.lock|uv\.lock|Pipfile\.lock|go\.sum|go\.mod|Cargo\.lock|pom\.xml|gradle\.lockfile|dependency-locks\/[^/]+\.lockfile)$/i

export function listManifestFiles(root, maxFiles) {
  const files = []
  const stack = [root]
  let visited = 0
  let truncated = false
  while (stack.length) {
    const directory = stack.pop()
    let entries
    try {
      entries = readdirSync(directory, {withFileTypes: true})
    } catch {
      continue
    }
    for (const entry of entries) {
      if (visited >= maxFiles) {
        truncated = true
        break
      }
      const absolute = join(directory, entry.name)
      const rel = relative(root, absolute).split(sep).join('/')
      if (entry.isSymbolicLink()) continue
      if (entry.isDirectory()) {
        if (!SKIP_DIRECTORIES.has(entry.name) && !entry.name.startsWith('.')) stack.push(absolute)
        continue
      }
      if (!entry.isFile()) continue
      visited += 1
      if (INTERESTING.test(rel)) files.push(rel)
    }
    if (truncated) break
  }
  return {files: files.sort(), visited, truncated}
}

export function safeRepositoryRoot(value) {
  if (!value) throw new Error('No repository root is active.')
  const absolute = resolve(value)
  if (!statSync(absolute).isDirectory()) {
    throw new Error(`Repository root is not a directory: ${absolute}`)
  }
  return realpathSync(absolute)
}
