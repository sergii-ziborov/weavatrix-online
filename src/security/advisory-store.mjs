import {createHash} from 'node:crypto'
import {collectPackageInventory, createAdvisoryQueryPlan} from './inventory.mjs'
import {matchAdvisories} from './version-match.mjs'
import {
  advisoryKey,
  advisoryStoreMetadata,
  advisoryStorePath,
  atomicWriteAdvisoryStore,
  emptyAdvisoryStore,
  loadAdvisoryStore,
  normalizeOsvAdvisory,
} from './advisory-cache.mjs'

export {
  advisoryStoreMetadata,
  advisoryStorePath,
  loadAdvisoryStore,
  normalizeOsvAdvisory,
}
export function advisoryQueryFingerprint(packages) {
  const rows = createAdvisoryQueryPlan(packages).packages
    .map((item) => `${item.ecosystem}|${item.name}|${item.version}`)
    .sort()
  return createHash('sha256').update(rows.join('\n'), 'utf8').digest('hex')
}

export function commitAdvisoryRefresh(options = {}) {
  const {
    plan,
    idsByPackage = [],
    advisoryRecords = {},
    queriedOk = 0,
    errors: initialErrors = [],
    repoKey = '',
    inventoryCoverage = null,
    storePath = advisoryStorePath(),
    now = new Date(),
  } = options
  const packages = plan?.packages || []
  const unsupported = Number(plan?.unsupported) || 0
  const errors = initialErrors.map(String)
  const invalid = validateRefresh(packages, unsupported, queriedOk, errors)
  if (invalid) return invalid

  const loaded = loadAdvisoryStore(storePath)
  const store = loaded.ok ? loaded.store : emptyAdvisoryStore()
  store.schema = 'weavatrix-online.advisories.v1'
  store.meta ||= {}
  store.meta.repos ||= {}
  store.records ||= {}
  const fetched = mergeAdvisoryRecords(
    store,
    packages,
    idsByPackage,
    advisoryRecords,
    errors,
  )
  const status = errors.length === 0
    && queriedOk === packages.length
    && inventoryCoverage?.state !== 'PARTIAL'
    ? 'COMPLETE'
    : 'PARTIAL'
  stampRefresh(store, {
    repoKey,
    status,
    packages,
    queriedOk,
    unsupported,
    errors,
    inventoryCoverage,
    fetchedAt: now.toISOString(),
  })
  try {
    atomicWriteAdvisoryStore(storePath, store)
  } catch (error) {
    return {
      ok: false,
      status: 'NOT_CHECKED',
      error: `advisory cache write failed: ${error.message}`,
      errors,
    }
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
  const fingerprintMatches = stamp?.query_fingerprint
    === advisoryQueryFingerprint(plan.packages)
  const ageMs = stamp?.fetched_at
    ? now.getTime() - Date.parse(stamp.fetched_at)
    : Number.POSITIVE_INFINITY
  const stale = !Number.isFinite(ageMs) || ageMs > maxAgeDays * 86_400_000
  const status = scanStatus(loaded, stamp, {
    fingerprintMatches,
    stale,
    inventoryComplete: inventory.coverage.state === 'COMPLETE',
  })
  const reasons = scanReasons(loaded, stamp, {
    fingerprintMatches,
    stale,
    inventoryComplete: inventory.coverage.state === 'COMPLETE',
    maxAgeDays,
  })
  const matches = loaded.ok
    ? matchAdvisories(
      plan.packages,
      (ecosystem, name) => loaded.store.records?.[advisoryKey(ecosystem, name)] || [],
    )
    : []
  return vulnerabilityReport({
    status,
    matches,
    reasons,
    storePath,
    loaded,
    stamp,
    maxAgeDays,
    fingerprintMatches,
    inventory,
    plan,
  })
}

function validateRefresh(packages, unsupported, queriedOk, errors) {
  if (!packages.length) {
    return {
      ok: false,
      status: 'NOT_CHECKED',
      queried: 0,
      unsupported,
      error: 'No OSV-supported pinned package versions found.',
    }
  }
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
  return null
}
function mergeAdvisoryRecords(store, packages, idsByPackage, recordsById, errors) {
  const wanted = new Map()
  idsByPackage.forEach((ids, index) => {
    if (!packages[index] || !Array.isArray(ids)) return
    store.records[advisoryKey(packages[index].ecosystem, packages[index].name)] = []
    for (const id of ids.map((value) => String(value || '')).filter(Boolean)) {
      if (!wanted.has(id)) wanted.set(id, [])
      wanted.get(id).push(packages[index])
    }
  })
  let fetched = 0
  for (const [id, packageList] of wanted) {
    const record = recordsById[id]
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
      mergePackageAdvisory(store, item, normalized)
      normalizedCount += 1
    }
    if (normalizedCount) fetched += 1
  }
  return fetched
}
function mergePackageAdvisory(store, item, normalized) {
  normalized.queriedVersions = [String(item.version)]
  const key = advisoryKey(item.ecosystem, item.name)
  const records = Array.isArray(store.records[key]) ? store.records[key] : []
  const existing = records.findIndex((candidate) => candidate.id === normalized.id)
  if (existing >= 0) {
    normalized.queriedVersions = [...new Set([
      ...(records[existing].queriedVersions || []),
      ...normalized.queriedVersions,
    ])]
    records[existing] = normalized
  } else {
    records.push(normalized)
  }
  store.records[key] = records
}

function stampRefresh(store, details) {
  store.meta.fetched_at = details.fetchedAt
  if (!details.repoKey) return
  store.meta.repos[details.repoKey] = {
    fetched_at: details.fetchedAt,
    status: details.status,
    queried: details.packages.length,
    queried_ok: details.queriedOk,
    unsupported: details.unsupported,
    error_count: details.errors.length,
    query_fingerprint: advisoryQueryFingerprint(details.packages),
    inventory_coverage: details.inventoryCoverage || null,
  }
}

function scanStatus(loaded, stamp, facts) {
  if (!loaded.ok) return 'NOT_CHECKED'
  return loaded.state === 'CURRENT_SCHEMA'
    && Boolean(stamp)
    && facts.fingerprintMatches
    && !facts.stale
    && stamp.status === 'COMPLETE'
    && facts.inventoryComplete
    ? 'COMPLETE'
    : 'PARTIAL'
}

function scanReasons(loaded, stamp, facts) {
  if (!loaded.ok) return [loaded.error]
  const reasons = []
  if (loaded.state !== 'CURRENT_SCHEMA') {
    reasons.push('cache was written by the retired core security surface; refresh through weavatrix-online')
  }
  if (!stamp) reasons.push('cache has no refresh stamp for the active repository')
  if (stamp && !facts.fingerprintMatches) {
    reasons.push('current pinned-package inventory differs from the cached query')
  }
  if (facts.stale) {
    reasons.push(`cache is older than ${facts.maxAgeDays} day(s) or has no valid timestamp`)
  }
  if (stamp && stamp.status !== 'COMPLETE') reasons.push('the last refresh was partial')
  if (!facts.inventoryComplete) reasons.push('current package inventory is partial')
  return reasons
}

function vulnerabilityReport(details) {
  const mapped = details.matches.slice(0, 500).map(
    ({pkg, advisory, matchedBy, confidence}) => ({
      id: advisory.id,
      kind: advisory.kind,
      severity: advisory.severity,
      package: {ecosystem: pkg.ecosystem, name: pkg.name, version: pkg.version},
      summary: advisory.summary,
      fixedIn: advisory.fixedIn || [],
      references: advisory.references || [],
      matchedBy,
      confidence,
    }),
  )
  return {
    schemaVersion: 'weavatrix-online.vulnerability-scan.v1',
    status: details.status,
    assessment: mapped.length
      ? 'KNOWN_MATCHES_REQUIRE_REVIEW'
      : 'NO_KNOWN_MATCHES_IN_AVAILABLE_CACHE',
    zeroVulnerabilityConclusionAllowed: details.status === 'COMPLETE',
    knownMatchCount: details.matches.length,
    matches: mapped,
    matchesTruncated: details.matches.length > 500,
    completeness: {
      status: details.status,
      reasons: details.reasons,
      cache: {
        path: details.storePath,
        state: details.loaded.state,
        fetchedAt: details.stamp?.fetched_at
          || details.loaded.store.meta?.fetched_at
          || null,
        maxAgeDays: details.maxAgeDays,
        fingerprintMatches: details.fingerprintMatches,
        refreshStatus: details.stamp?.status || 'NOT_CHECKED',
      },
      inventory: details.inventory.coverage,
      queryablePackages: details.plan.packages.length,
      unsupportedPackages: details.plan.unsupported,
    },
  }
}
