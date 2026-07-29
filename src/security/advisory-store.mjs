import {createHash} from 'node:crypto'
import {existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync} from 'node:fs'
import {homedir} from 'node:os'
import {dirname, join} from 'node:path'
import {collectPackageInventory, createAdvisoryQueryPlan} from './inventory.mjs'
import {matchAdvisories} from './version-match.mjs'

const STORE_SCHEMA = 'weavatrix-online.advisories.v1'

export const advisoryStorePath = () => process.env.WEAVATRIX_ADVISORY_STORE
  ? String(process.env.WEAVATRIX_ADVISORY_STORE)
  : join(homedir(), '.weavatrix', 'advisories.json')

const keyOf = (ecosystem, name) => `${ecosystem}|${ecosystem === 'PyPI'
  ? String(name).toLowerCase().replace(/[-_.]+/g, '-')
  : name}`

export function advisoryQueryFingerprint(packages) {
  const rows = createAdvisoryQueryPlan(packages).packages
    .map((item) => `${item.ecosystem}|${item.name}|${item.version}`)
    .sort()
  return createHash('sha256').update(rows.join('\n'), 'utf8').digest('hex')
}

export function loadAdvisoryStore(storePath = advisoryStorePath()) {
  if (!existsSync(storePath)) {
    return {ok: false, state: 'MISSING', store: emptyStore(), error: 'advisory cache does not exist'}
  }
  try {
    const parsed = JSON.parse(readFileSync(storePath, 'utf8'))
    if (!parsed || typeof parsed !== 'object' || !parsed.records || typeof parsed.records !== 'object') {
      return {ok: false, state: 'INVALID', store: emptyStore(), error: 'advisory cache has no records object'}
    }
    // The old core-owned cache had no schema field. Read it for migration, but
    // only an Online refresh can establish a COMPLETE current-inventory stamp.
    return {
      ok: true,
      state: parsed.schema === STORE_SCHEMA ? 'CURRENT_SCHEMA' : 'LEGACY_SCHEMA',
      store: parsed,
      error: null,
    }
  } catch (error) {
    return {ok: false, state: 'INVALID', store: emptyStore(), error: error.message}
  }
}

export function advisoryStoreMetadata(storePath = advisoryStorePath()) {
  const loaded = loadAdvisoryStore(storePath)
  return {
    path: storePath,
    state: loaded.state,
    fetchedAt: loaded.store.meta?.fetched_at || null,
    advisoryCount: Object.values(loaded.store.records || {})
      .reduce((total, records) => total + (Array.isArray(records) ? records.length : 0), 0),
  }
}

export function normalizeOsvAdvisory(record, ecosystem, name) {
  const affected = (record?.affected || []).find((item) => item?.package
    && item.package.ecosystem === ecosystem
    && keyOf(ecosystem, item.package.name) === keyOf(ecosystem, name))
  if (!affected || !record?.id) return null
  const fixed = []
  for (const range of affected.ranges || []) {
    for (const event of range.events || []) if (event.fixed) fixed.push(event.fixed)
  }
  return {
    id: String(record.id),
    kind: String(record.id).startsWith('MAL-') ? 'malicious-advisory' : 'vulnerability',
    severity: severityOf(record),
    summary: String(record.summary || record.details || '').slice(0, 500),
    modified: record.modified || '',
    aliases: [...new Set(record.aliases || [])].slice(0, 10),
    references: (record.references || []).map((item) => item?.url).filter(Boolean).slice(0, 5),
    fixedIn: [...new Set(fixed)].slice(0, 10),
    affected: {
      versions: Array.isArray(affected.versions) ? affected.versions : [],
      ranges: Array.isArray(affected.ranges) ? affected.ranges : [],
    },
  }
}

export function commitAdvisoryRefresh({
  plan,
  idsByPackage = [],
  advisoryRecords = {},
  queriedOk = 0,
  errors: initialErrors = [],
  repoKey = '',
  inventoryCoverage = null,
  storePath = advisoryStorePath(),
  now = new Date(),
} = {}) {
  const packages = plan?.packages || []
  const unsupported = Number(plan?.unsupported) || 0
  if (!packages.length) {
    return {ok: false, status: 'NOT_CHECKED', queried: 0, unsupported, error: 'No OSV-supported pinned package versions found.'}
  }
  const errors = initialErrors.map(String)
  if (errors.length && queriedOk === 0) {
    return {
      ok: false,
      status: 'NOT_CHECKED',
      queried: packages.length,
      unsupported,
      error: `advisory refresh failed before any package completed: ${errors[0]}`,
      errors,
    }
  }

  const loaded = loadAdvisoryStore(storePath)
  const store = loaded.ok ? loaded.store : emptyStore()
  store.schema = STORE_SCHEMA
  store.meta ||= {}
  store.meta.repos ||= {}
  store.records ||= {}
  const wanted = new Map()
  idsByPackage.forEach((ids, index) => {
    if (!packages[index] || !Array.isArray(ids)) return
    store.records[keyOf(packages[index].ecosystem, packages[index].name)] = []
    for (const id of Array.isArray(ids) ? ids : []) {
      const normalizedId = String(id || '')
      if (!normalizedId) continue
      if (!wanted.has(normalizedId)) wanted.set(normalizedId, [])
      wanted.get(normalizedId).push(packages[index])
    }
  })

  let fetched = 0
  for (const [id, packageList] of wanted) {
    const record = advisoryRecords[id]
    if (!record || record.id !== id) {
      errors.push(`${id}: advisory detail response is missing or has a mismatched id`)
      continue
    }
    let normalizedCount = 0
    for (const item of packageList) {
      const normalized = normalizeOsvAdvisory(record, item.ecosystem, item.name)
      if (!normalized) {
        errors.push(`${id}: advisory detail does not describe ${item.ecosystem}:${item.name}`)
        continue
      }
      normalized.queriedVersions = [String(item.version)]
      normalizedCount += 1
      const key = keyOf(item.ecosystem, item.name)
      const records = Array.isArray(store.records[key]) ? store.records[key] : []
      const existing = records.findIndex((candidate) => candidate.id === normalized.id)
      if (existing >= 0) {
        normalized.queriedVersions = [...new Set([
          ...(records[existing].queriedVersions || []),
          ...normalized.queriedVersions,
        ])]
        records[existing] = normalized
      }
      else records.push(normalized)
      store.records[key] = records
    }
    if (normalizedCount) fetched += 1
  }

  const fetchedAt = now.toISOString()
  const complete = errors.length === 0
    && queriedOk === packages.length
    && inventoryCoverage?.state !== 'PARTIAL'
  const status = complete ? 'COMPLETE' : 'PARTIAL'
  store.meta.fetched_at = fetchedAt
  if (repoKey) {
    store.meta.repos[repoKey] = {
      fetched_at: fetchedAt,
      status,
      queried: packages.length,
      queried_ok: queriedOk,
      unsupported,
      error_count: errors.length,
      query_fingerprint: advisoryQueryFingerprint(packages),
      inventory_coverage: inventoryCoverage || null,
    }
  }
  try {
    atomicWrite(storePath, store)
  } catch (error) {
    return {ok: false, status: 'NOT_CHECKED', error: `advisory cache write failed: ${error.message}`, errors}
  }
  return {
    ok: true,
    status,
    queried: packages.length,
    queriedOk,
    unsupported,
    packagesWithAdvisoryIds: idsByPackage.filter((ids) => Array.isArray(ids) && ids.length).length,
    fetched,
    saved: true,
    errors,
  }
}

export function scanCachedVulnerabilities(repoRoot, {
  maxAgeDays = 30,
  storePath = advisoryStorePath(),
  now = new Date(),
} = {}) {
  const inventory = collectPackageInventory(repoRoot)
  const plan = createAdvisoryQueryPlan(inventory)
  const loaded = loadAdvisoryStore(storePath)
  const stamp = loaded.store.meta?.repos?.[repoRoot] || null
  const currentFingerprint = advisoryQueryFingerprint(plan.packages)
  const ageMs = stamp?.fetched_at ? now.getTime() - Date.parse(stamp.fetched_at) : Number.POSITIVE_INFINITY
  const stale = !Number.isFinite(ageMs) || ageMs > maxAgeDays * 86_400_000
  const fingerprintMatches = stamp?.query_fingerprint === currentFingerprint
  const refreshComplete = stamp?.status === 'COMPLETE'
  const complete = loaded.ok
    && loaded.state === 'CURRENT_SCHEMA'
    && Boolean(stamp)
    && fingerprintMatches
    && !stale
    && refreshComplete
    && inventory.coverage.state === 'COMPLETE'

  let status = complete ? 'COMPLETE' : 'PARTIAL'
  const reasons = []
  if (!loaded.ok) {
    status = 'NOT_CHECKED'
    reasons.push(loaded.error)
  } else {
    if (loaded.state !== 'CURRENT_SCHEMA') reasons.push('cache was written by the retired core security surface; refresh through weavatrix-online')
    if (!stamp) reasons.push('cache has no refresh stamp for the active repository')
    if (stamp && !fingerprintMatches) reasons.push('current pinned-package inventory differs from the cached query')
    if (stale) reasons.push(`cache is older than ${maxAgeDays} day(s) or has no valid timestamp`)
    if (stamp && !refreshComplete) reasons.push('the last refresh was partial')
    if (inventory.coverage.state !== 'COMPLETE') reasons.push('current package inventory is partial')
  }

  const matches = loaded.ok
    ? matchAdvisories(plan.packages, (ecosystem, name) => loaded.store.records?.[keyOf(ecosystem, name)] || [])
    : []
  return {
    schemaVersion: 'weavatrix-online.vulnerability-scan.v1',
    status,
    assessment: matches.length ? 'KNOWN_MATCHES_REQUIRE_REVIEW' : 'NO_KNOWN_MATCHES_IN_AVAILABLE_CACHE',
    zeroVulnerabilityConclusionAllowed: status === 'COMPLETE',
    knownMatchCount: matches.length,
    matches: matches.slice(0, 500).map(({pkg, advisory, matchedBy, confidence}) => ({
      id: advisory.id,
      kind: advisory.kind,
      severity: advisory.severity,
      package: {ecosystem: pkg.ecosystem, name: pkg.name, version: pkg.version},
      summary: advisory.summary,
      fixedIn: advisory.fixedIn || [],
      references: advisory.references || [],
      matchedBy,
      confidence,
    })),
    matchesTruncated: matches.length > 500,
    completeness: {
      status,
      reasons,
      cache: {
        path: storePath,
        state: loaded.state,
        fetchedAt: stamp?.fetched_at || loaded.store.meta?.fetched_at || null,
        maxAgeDays,
        fingerprintMatches,
        refreshStatus: stamp?.status || 'NOT_CHECKED',
      },
      inventory: inventory.coverage,
      queryablePackages: plan.packages.length,
      unsupportedPackages: plan.unsupported,
    },
  }
}

function severityOf(record) {
  const label = String(record.database_specific?.severity || '').toLowerCase()
  if (['critical', 'high', 'low'].includes(label)) return label
  if (label === 'moderate' || label === 'medium') return 'medium'
  let best = 0
  for (const severity of record.severity || []) {
    const score = String(severity?.score || '')
    const numeric = score.match(/^(\d+(?:\.\d+)?)$/)
    if (numeric) best = Math.max(best, Number(numeric[1]))
  }
  if (best >= 9) return 'critical'
  if (best >= 7) return 'high'
  if (best > 0 && best < 4) return 'low'
  return 'medium'
}

function emptyStore() {
  return {schema: STORE_SCHEMA, meta: {fetched_at: null, repos: {}}, records: {}}
}

function atomicWrite(path, value) {
  mkdirSync(dirname(path), {recursive: true})
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`
  const backup = `${path}.bak-${process.pid}-${Date.now()}`
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, {encoding: 'utf8', mode: 0o600})
  let movedExisting = false
  try {
    if (existsSync(path)) {
      renameSync(path, backup)
      movedExisting = true
    }
    renameSync(temporary, path)
    if (movedExisting) rmSync(backup, {force: true})
  } catch (error) {
    rmSync(temporary, {force: true})
    if (movedExisting && !existsSync(path)) renameSync(backup, path)
    throw error
  }
}
