import {
  advisoryStoreMetadata,
  commitAdvisoryRefresh,
  scanCachedVulnerabilities,
} from '../security/advisory-store.mjs'
import {collectPackageInventory, createAdvisoryQueryPlan} from '../security/inventory.mjs'

const BATCH_URL = 'https://api.osv.dev/v1/querybatch'
const DETAIL_URL = 'https://api.osv.dev/v1/vulns/'

async function fetchJson(url, options, timeoutMs) {
  const response = await fetch(url, {...options, signal: AbortSignal.timeout(timeoutMs)})
  if (!response.ok) throw new Error(`HTTP ${response.status} from OSV`)
  return response.json()
}

export async function refreshAdvisories(graph, args, ctx) {
  let inventory
  try {
    inventory = collectPackageInventory(ctx.repoRoot)
  } catch (error) {
    return {
      schemaVersion: 'weavatrix-online.advisory-refresh.v1',
      status: 'NOT_CHECKED',
      error: error.message,
      completeness: {status: 'NOT_CHECKED', reasons: ['package inventory failed']},
    }
  }
  const plan = createAdvisoryQueryPlan(inventory)
  if (!plan.packages.length) {
    return {
      schemaVersion: 'weavatrix-online.advisory-refresh.v1',
      status: 'NOT_CHECKED',
      error: 'No OSV-supported pinned packages found (npm/PyPI/Go/Maven/crates.io).',
      completeness: {status: 'NOT_CHECKED', inventory: inventory.coverage},
    }
  }
  const timeoutMs = Math.min(120000, Math.max(1000, Number(args.timeout_ms) || 20000))
  const batchSize = 100
  const idsByPackage = Array.from({length: plan.packages.length}, () => null)
  const errors = []
  let queriedOk = 0

  for (let index = 0; index < plan.packages.length; index += batchSize) {
    const batch = plan.packages.slice(index, index + batchSize)
    try {
      const body = await fetchJson(BATCH_URL, {
        method: 'POST', headers: {'content-type': 'application/json'},
        body: JSON.stringify({queries: batch.map((item) => ({package: {ecosystem: item.ecosystem, name: item.name}, version: item.version}))}),
      }, timeoutMs)
      if (!Array.isArray(body?.results) || body.results.length !== batch.length) throw new Error('OSV querybatch returned an invalid result count')
      body.results.forEach((result, offset) => {
        if (result?.vulns !== undefined && !Array.isArray(result.vulns)) throw new Error(`OSV result ${offset + 1} has non-array vulns`)
        idsByPackage[index + offset] = (result?.vulns || []).map((item) => String(item?.id || '')).filter(Boolean)
      })
      queriedOk += batch.length
    } catch (error) {
      errors.push(`querybatch ${Math.floor(index / batchSize) + 1}: ${error.message}`)
    }
  }

  const advisoryRecords = {}
  const wanted = [...new Set(idsByPackage.flat())]
  for (const id of wanted) {
    try {
      const record = await fetchJson(`${DETAIL_URL}${encodeURIComponent(id)}`, {}, timeoutMs)
      if (record?.id !== id) throw new Error(`detail id mismatch for ${id}`)
      advisoryRecords[id] = record
    } catch (error) { errors.push(`${id}: ${error.message}`) }
  }

  const result = commitAdvisoryRefresh({
    plan,
    idsByPackage,
    advisoryRecords,
    queriedOk,
    errors,
    repoKey: ctx.repoRoot,
    inventoryCoverage: inventory.coverage,
  })
  const metadata = advisoryStoreMetadata()
  if (!result.ok) {
    return {
      schemaVersion: 'weavatrix-online.advisory-refresh.v1',
      ...result,
      store: metadata,
      completeness: {status: 'NOT_CHECKED', inventory: inventory.coverage},
    }
  }
  const currentMatches = scanCachedVulnerabilities(ctx.repoRoot)
  return {
    schemaVersion: 'weavatrix-online.advisory-refresh.v1',
    ...result,
    store: metadata,
    currentMatches: {
      status: currentMatches.status,
      knownMatchCount: currentMatches.knownMatchCount,
      zeroVulnerabilityConclusionAllowed: currentMatches.zeroVulnerabilityConclusionAllowed,
    },
    completeness: {
      status: result.status,
      inventory: inventory.coverage,
      requestErrors: result.errors,
    },
  }
}

export function scanDependencyVulnerabilities(graph, args, ctx) {
  const maxAgeDays = Math.min(365, Math.max(1, Number(args.max_age_days) || 30))
  return scanCachedVulnerabilities(ctx.repoRoot, {maxAgeDays})
}
