import {readFileSync} from 'node:fs'
import {join} from 'node:path'
import {listManifestFiles, safeRepositoryRoot} from './manifest-discovery.mjs'
import {OSV_ECOSYSTEMS, uniquePackages} from './inventory-model.mjs'
import {
  parsePackageLock,
  parsePipfileLock,
  parsePnpmLock,
  parseRequirements,
  parseTomlLock,
  parseYarnLock,
} from './inventory-parsers-node-python.mjs'
import {
  parseCargoLock,
  parseGoMod,
  parseGoSum,
  parseGradleLock,
  parseMavenPom,
} from './inventory-parsers-native.mjs'

export {
  parseCargoLock,
  parseGoMod,
  parseGoSum,
  parseGradleLock,
  parseMavenPom,
  parsePackageLock,
  parsePipfileLock,
  parsePnpmLock,
  parseRequirements,
  parseTomlLock,
  parseYarnLock,
}

function parseManifest(file, text) {
  if (/(^|\/)package-lock\.json$/i.test(file)) return {packages: parsePackageLock(JSON.parse(text))}
  if (/(^|\/)yarn\.lock$/i.test(file)) return {packages: parseYarnLock(text)}
  if (/(^|\/)pnpm-lock\.yaml$/i.test(file)) return {packages: parsePnpmLock(text)}
  if (/(^|\/)requirements[^/]*\.(?:txt|in)$/i.test(file)) return parseRequirements(text)
  if (/(^|\/)(?:poetry|uv)\.lock$/i.test(file)) return {packages: parseTomlLock(text)}
  if (/(^|\/)Pipfile\.lock$/i.test(file)) return {packages: parsePipfileLock(JSON.parse(text))}
  if (/(^|\/)go\.sum$/i.test(file)) return {packages: parseGoSum(text)}
  if (/(^|\/)go\.mod$/i.test(file)) return {packages: parseGoMod(text)}
  if (/(^|\/)Cargo\.lock$/i.test(file)) return {packages: parseCargoLock(text)}
  if (/(^|\/)pom\.xml$/i.test(file)) return parseMavenPom(text)
  if (/(^|\/)(?:gradle\.lockfile|dependency-locks\/[^/]+\.lockfile)$/i.test(file)) {
    return {packages: parseGradleLock(text)}
  }
  return {packages: []}
}

export function collectPackageInventory(repoRoot, {maxFiles = 25000, maxPackages = 10000} = {}) {
  const root = safeRepositoryRoot(repoRoot)
  const walk = listManifestFiles(root, maxFiles)
  const packages = []
  const parseErrors = []
  let unpinned = 0

  for (const file of walk.files) {
    try {
      const parsed = parseManifest(file, readFileSync(join(root, ...file.split('/')), 'utf8'))
      packages.push(...parsed.packages)
      unpinned += parsed.unpinned || 0
    } catch (error) {
      parseErrors.push(`${file}: ${error.message}`)
    }
  }

  const deduped = uniquePackages(packages)
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
  const packages = uniquePackages(pinned.filter((item) => OSV_ECOSYSTEMS.has(item.ecosystem)))
    .map(({ecosystem, name, version}) => ({ecosystem, name, version}))
  return Object.freeze({packages: Object.freeze(packages), unsupported})
}
