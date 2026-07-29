import {readFileSync, readdirSync, realpathSync, statSync} from 'node:fs'
import {basename, join, relative, resolve, sep} from 'node:path'

const SKIP_DIRECTORIES = new Set([
  '.git', '.hg', '.svn', '.idea', '.vscode', 'node_modules', 'vendor',
  '.venv', 'venv', 'env', 'dist', 'build', 'coverage', 'target',
])
const INTERESTING = /(^|\/)(?:package-lock\.json|yarn\.lock|pnpm-lock\.yaml|requirements[^/]*\.(?:txt|in)|poetry\.lock|uv\.lock|Pipfile\.lock|go\.sum|go\.mod|Cargo\.lock|pom\.xml|gradle\.lockfile|dependency-locks\/[^/]+\.lockfile)$/i
const OSV_ECOSYSTEMS = new Set(['npm', 'PyPI', 'Go', 'Maven', 'crates.io'])

const normalizePyPi = (name) => String(name || '').toLowerCase().replace(/[-_.]+/g, '-')
const unique = (items) => {
  const seen = new Set()
  return items.filter((item) => {
    const key = `${item.ecosystem}|${item.name}|${item.version}`
    if (!item.name || !item.version || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function collectPackageInventory(repoRoot, {maxFiles = 25000, maxPackages = 10000} = {}) {
  const root = safeRoot(repoRoot)
  const walk = listManifestFiles(root, maxFiles)
  const packages = []
  const parseErrors = []
  let unpinned = 0

  for (const file of walk.files) {
    const absolute = join(root, ...file.split('/'))
    let text
    try {
      text = readFileSync(absolute, 'utf8')
    } catch (error) {
      parseErrors.push(`${file}: ${error.message}`)
      continue
    }
    try {
      if (/(^|\/)package-lock\.json$/i.test(file)) packages.push(...parsePackageLock(JSON.parse(text)))
      else if (/(^|\/)yarn\.lock$/i.test(file)) packages.push(...parseYarnLock(text))
      else if (/(^|\/)pnpm-lock\.yaml$/i.test(file)) packages.push(...parsePnpmLock(text))
      else if (/(^|\/)requirements[^/]*\.(?:txt|in)$/i.test(file)) {
        const result = parseRequirements(text)
        packages.push(...result.packages)
        unpinned += result.unpinned
      } else if (/(^|\/)(?:poetry|uv)\.lock$/i.test(file)) packages.push(...parseTomlLock(text))
      else if (/(^|\/)Pipfile\.lock$/i.test(file)) packages.push(...parsePipfileLock(JSON.parse(text)))
      else if (/(^|\/)go\.sum$/i.test(file)) packages.push(...parseGoSum(text))
      else if (/(^|\/)go\.mod$/i.test(file)) packages.push(...parseGoMod(text))
      else if (/(^|\/)Cargo\.lock$/i.test(file)) packages.push(...parseCargoLock(text))
      else if (/(^|\/)pom\.xml$/i.test(file)) {
        const result = parseMavenPom(text)
        packages.push(...result.packages)
        unpinned += result.unpinned
      } else if (/(^|\/)(?:gradle\.lockfile|dependency-locks\/[^/]+\.lockfile)$/i.test(file)) {
        packages.push(...parseGradleLock(text))
      }
    } catch (error) {
      parseErrors.push(`${file}: ${error.message}`)
    }
  }

  const deduped = unique(packages)
  const truncatedPackages = deduped.length > maxPackages
  const selected = deduped.slice(0, maxPackages)
  const ecosystems = Object.fromEntries([...new Set(selected.map((item) => item.ecosystem))]
    .sort().map((ecosystem) => [ecosystem, selected.filter((item) => item.ecosystem === ecosystem).length]))
  const complete = !walk.truncated && !truncatedPackages && parseErrors.length === 0
  return {
    packages: selected,
    coverage: {
      state: complete ? 'COMPLETE' : 'PARTIAL',
      manifests: walk.files.length,
      ecosystems,
      pinnedPackages: selected.length,
      unpinnedDeclarations: unpinned,
      filesVisited: walk.visited,
      truncatedFiles: walk.truncated,
      truncatedPackages,
      parseErrors: parseErrors.slice(0, 20),
      parseErrorsTruncated: parseErrors.length > 20,
      supportedEcosystems: [...OSV_ECOSYSTEMS],
      boundary: 'tracked-style repository manifests; dependency directories are excluded from advisory inventory',
    },
  }
}

export function createAdvisoryQueryPlan(inventory) {
  const source = Array.isArray(inventory) ? inventory : inventory?.packages || []
  const pinned = source.filter((item) => item?.ecosystem && item?.name && item?.version)
  const unsupported = pinned.filter((item) => !OSV_ECOSYSTEMS.has(item.ecosystem)).length
  const packages = unique(pinned.filter((item) => OSV_ECOSYSTEMS.has(item.ecosystem)))
    .map(({ecosystem, name, version}) => ({ecosystem, name, version}))
  return Object.freeze({packages: Object.freeze(packages), unsupported})
}

export function parsePackageLock(json) {
  const out = []
  if (json?.packages && typeof json.packages === 'object') {
    for (const [path, value] of Object.entries(json.packages)) {
      if (!path.includes('node_modules/') || !value?.version) continue
      const name = path.slice(path.lastIndexOf('node_modules/') + 13)
      if (name && !name.startsWith('.')) out.push(pkg('npm', name, value.version, 'package-lock'))
    }
  } else {
    const visit = (dependencies) => {
      for (const [name, value] of Object.entries(dependencies || {})) {
        if (value?.version) out.push(pkg('npm', name, value.version, 'package-lock'))
        visit(value?.dependencies)
      }
    }
    visit(json?.dependencies)
  }
  return unique(out)
}

export function parseYarnLock(text) {
  const out = []
  const pattern = /^((?:"[^\n]*")|(?:[^\s#"][^\n]*?)):\r?\n\s+version\s+"([^"]+)"/gm
  for (const match of String(text || '').matchAll(pattern)) {
    const selector = match[1].split(',')[0].trim().replace(/^"|"$/g, '')
    const npmAlias = selector.indexOf('@npm:')
    let name
    if (npmAlias >= 0) {
      const after = selector.slice(npmAlias + 5)
      const at = after.startsWith('@') ? after.indexOf('@', 1) : after.indexOf('@')
      name = /^[a-z@]/i.test(after) ? (at > 0 ? after.slice(0, at) : after) : selector.slice(0, npmAlias)
    } else {
      const at = selector.lastIndexOf('@')
      name = at > 0 ? selector.slice(0, at) : ''
    }
    if (name) out.push(pkg('npm', name, match[2], 'yarn-lock'))
  }
  return unique(out)
}

export function parsePnpmLock(text) {
  const out = []
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim().replace(/^['"]|['"]:?\s*$/g, '')
    let match = line.match(/^\/?(@[^/]+\/[^@/]+|[^@/:\s]+)@([0-9][^(:\s]*)/)
    if (!match) match = line.match(/^\/?(@[^/]+\/[^/]+|[^/:\s]+)\/([0-9][^:\s]*):?$/)
    if (match) out.push(pkg('npm', match[1], match[2], 'pnpm-lock'))
  }
  return unique(out)
}

export function parseRequirements(text) {
  const packages = []
  let unpinned = 0
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.replace(/(^|\s)#.*$/, '').trim()
    if (!line || line.startsWith('-')) continue
    const match = line.match(/^([A-Za-z0-9][\w.-]*)\s*(===?|~=)\s*([\w.!+*-]+)/)
    if (match) packages.push(pkg('PyPI', normalizePyPi(match[1]), match[3].replace(/\.\*$/, ''), 'requirements'))
    else if (/^[A-Za-z0-9][\w.-]*/.test(line)) unpinned += 1
  }
  return {packages: unique(packages), unpinned}
}

export function parseTomlLock(text) {
  const out = []
  let name = ''
  let inPackage = false
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim()
    if (line === '[[package]]') {
      name = ''
      inPackage = true
      continue
    }
    if (line.startsWith('[')) {
      inPackage = false
      continue
    }
    if (!inPackage) continue
    const nameMatch = line.match(/^name\s*=\s*"([^"]+)"/)
    if (nameMatch) name = nameMatch[1]
    const versionMatch = line.match(/^version\s*=\s*"([^"]+)"/)
    if (versionMatch && name) {
      out.push(pkg('PyPI', normalizePyPi(name), versionMatch[1], 'python-lock'))
      name = ''
    }
  }
  return unique(out)
}

export function parsePipfileLock(json) {
  const out = []
  for (const section of ['default', 'develop']) {
    for (const [name, value] of Object.entries(json?.[section] || {})) {
      const version = String(value?.version || '').replace(/^==/, '')
      if (version) out.push(pkg('PyPI', normalizePyPi(name), version, 'pipfile-lock'))
    }
  }
  return unique(out)
}

export function parseGoSum(text) {
  const out = []
  for (const raw of String(text || '').split(/\r?\n/)) {
    const match = raw.trim().match(/^(\S+)\s+v([\w.+-]+?)(\/go\.mod)?\s+h1:/)
    if (match && !match[3]) out.push(pkg('Go', match[1], match[2], 'go-sum'))
  }
  return unique(out)
}

export function parseGoMod(text) {
  const out = []
  const source = String(text || '').replace(/\/\/[^\n]*/g, '')
  for (const match of source.matchAll(/(?:^|\n)\s*([A-Za-z0-9_.~/-]+)\s+v([\w.+-]+)/g)) {
    if (match[1] !== 'module' && match[1] !== 'go') out.push(pkg('Go', match[1], match[2], 'go-mod'))
  }
  return unique(out)
}

export function parseCargoLock(text) {
  const out = []
  for (const block of String(text || '').split(/\[\[package\]\]/).slice(1)) {
    const name = block.match(/(?:^|\n)name\s*=\s*"([^"]+)"/)?.[1]
    const version = block.match(/(?:^|\n)version\s*=\s*"([^"]+)"/)?.[1]
    if (name && version) out.push(pkg('crates.io', name, version, 'cargo-lock'))
  }
  return unique(out)
}

export function parseMavenPom(text) {
  const source = String(text || '')
  const properties = new Map()
  for (const match of source.matchAll(/<([A-Za-z0-9_.-]+)>\s*([^<]+)\s*<\/\1>/g)) {
    properties.set(match[1], match[2].trim())
  }
  const packages = []
  let unpinned = 0
  for (const match of source.matchAll(/<dependency\b[\s\S]*?<\/dependency>/g)) {
    const block = match[0]
    const group = block.match(/<groupId>\s*([^<]+)\s*<\/groupId>/)?.[1]?.trim()
    const artifact = block.match(/<artifactId>\s*([^<]+)\s*<\/artifactId>/)?.[1]?.trim()
    let version = block.match(/<version>\s*([^<]+)\s*<\/version>/)?.[1]?.trim()
    const property = version?.match(/^\$\{([^}]+)\}$/)?.[1]
    if (property) version = properties.get(property)
    if (group && artifact && version && !/[${}\[\](),+*]/.test(version)) {
      packages.push(pkg('Maven', `${group}:${artifact}`, version, 'maven-pom'))
    } else if (group && artifact) {
      unpinned += 1
    }
  }
  return {packages: unique(packages), unpinned}
}

export function parseGradleLock(text) {
  const out = []
  for (const raw of String(text || '').split(/\r?\n/)) {
    const match = raw.trim().match(/^([^:#\s]+):([^:#\s]+):([^=\s]+)(?:=.*)?$/)
    if (match) out.push(pkg('Maven', `${match[1]}:${match[2]}`, match[3], 'gradle-lock'))
  }
  return unique(out)
}

function listManifestFiles(root, maxFiles) {
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

function safeRoot(value) {
  if (!value) throw new Error('No repository root is active.')
  const absolute = resolve(value)
  if (!statSync(absolute).isDirectory()) throw new Error(`Repository root is not a directory: ${absolute}`)
  return realpathSync(absolute)
}

function pkg(ecosystem, name, version, source) {
  return {ecosystem, name: String(name), version: String(version).replace(/^v(?=\d)/, ''), source}
}
