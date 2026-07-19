import {
  advisoryCacheMetadata, commitAdvisoryRefresh, createAdvisoryQueryPlan,
  installedPackageCoordinates,
} from 'weavatrix/extension/local-services'

const BATCH_URL = 'https://api.osv.dev/v1/querybatch'
const DETAIL_URL = 'https://api.osv.dev/v1/vulns/'

async function fetchJson(url, options, timeoutMs) {
  const response = await fetch(url, {...options, signal: AbortSignal.timeout(timeoutMs)})
  if (!response.ok) throw new Error(`HTTP ${response.status} from OSV`)
  return response.json()
}

export async function refreshAdvisories(graph, args, ctx) {
  let installed
  try { installed = installedPackageCoordinates(ctx.repoRoot) } catch (error) { return error.message }
  const plan = createAdvisoryQueryPlan(installed)
  if (!plan.packages.length) return 'No OSV-supported pinned packages found (npm/PyPI/Go/Maven/crates.io).'
  const timeoutMs = Math.min(120000, Math.max(1000, Number(args.timeout_ms) || 20000))
  const batchSize = 100
  const idsByPackage = Array.from({length: plan.packages.length}, () => [])
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
    plan, idsByPackage, advisoryRecords, queriedOk, errors, repoKey: ctx.repoRoot,
  })
  if (!result.ok) return `Advisory refresh failed: ${result.error}`
  const metadata = advisoryCacheMetadata()
  return [
    `Advisory store ${result.status === 'PARTIAL' ? 'partially refreshed' : 'refreshed'} from OSV.dev: ${result.queriedOk}/${result.queried} package versions queried successfully, ${result.vulnerable} with known advisories (${result.fetched} records fetched).`,
    result.unsupported ? `${result.unsupported} packages skipped because their ecosystem is not OSV-queryable.` : null,
    result.errors?.length ? `Partial: ${result.errors.length} request/validation error(s), first: ${result.errors[0]}` : null,
    `Store: ${metadata.path} (${metadata.advisoryCount} advisories, fetched ${metadata.fetchedAt}). Core run_audit now reads it offline.`,
  ].filter(Boolean).join('\n')
}
