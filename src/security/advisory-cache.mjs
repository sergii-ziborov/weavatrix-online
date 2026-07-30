import {existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync} from 'node:fs'
import {homedir} from 'node:os'
import {dirname, join} from 'node:path'

const STORE_SCHEMA = 'weavatrix-online.advisories.v1'

export const advisoryStorePath = () => process.env.WEAVATRIX_ADVISORY_STORE
  ? String(process.env.WEAVATRIX_ADVISORY_STORE)
  : join(homedir(), '.weavatrix', 'advisories.json')

export const advisoryKey = (ecosystem, name) => `${ecosystem}|${ecosystem === 'PyPI'
  ? String(name).toLowerCase().replace(/[-_.]+/g, '-')
  : name}`

export function loadAdvisoryStore(storePath = advisoryStorePath()) {
  if (!existsSync(storePath)) {
    return {
      ok: false,
      state: 'MISSING',
      store: emptyAdvisoryStore(),
      error: 'advisory cache does not exist',
    }
  }
  try {
    const parsed = JSON.parse(readFileSync(storePath, 'utf8'))
    if (!parsed || typeof parsed !== 'object' || !parsed.records
      || typeof parsed.records !== 'object') {
      return {
        ok: false,
        state: 'INVALID',
        store: emptyAdvisoryStore(),
        error: 'advisory cache has no records object',
      }
    }
    return {
      ok: true,
      state: parsed.schema === STORE_SCHEMA ? 'CURRENT_SCHEMA' : 'LEGACY_SCHEMA',
      store: parsed,
      error: null,
    }
  } catch (error) {
    return {
      ok: false,
      state: 'INVALID',
      store: emptyAdvisoryStore(),
      error: error.message,
    }
  }
}

export function advisoryStoreMetadata(storePath = advisoryStorePath()) {
  const loaded = loadAdvisoryStore(storePath)
  return {
    path: storePath,
    state: loaded.state,
    fetchedAt: loaded.store.meta?.fetched_at || null,
    advisoryCount: Object.values(loaded.store.records || {})
      .reduce(
        (total, records) => total + (Array.isArray(records) ? records.length : 0),
        0,
      ),
  }
}

export function normalizeOsvAdvisory(record, ecosystem, name) {
  const affected = (record?.affected || []).find((item) => item?.package
    && item.package.ecosystem === ecosystem
    && advisoryKey(ecosystem, item.package.name) === advisoryKey(ecosystem, name))
  if (!affected || !record?.id) return null
  const fixed = []
  for (const range of affected.ranges || []) {
    for (const event of range.events || []) {
      if (event.fixed) fixed.push(event.fixed)
    }
  }
  return {
    id: String(record.id),
    kind: String(record.id).startsWith('MAL-')
      ? 'malicious-advisory'
      : 'vulnerability',
    severity: severityOf(record),
    summary: String(record.summary || record.details || '').slice(0, 500),
    modified: record.modified || '',
    aliases: [...new Set(record.aliases || [])].slice(0, 10),
    references: (record.references || [])
      .map((item) => item?.url)
      .filter(Boolean)
      .slice(0, 5),
    fixedIn: [...new Set(fixed)].slice(0, 10),
    affected: {
      versions: Array.isArray(affected.versions) ? affected.versions : [],
      ranges: Array.isArray(affected.ranges) ? affected.ranges : [],
    },
  }
}

export function emptyAdvisoryStore() {
  return {
    schema: STORE_SCHEMA,
    meta: {fetched_at: null, repos: {}},
    records: {},
  }
}

export function atomicWriteAdvisoryStore(path, value) {
  mkdirSync(dirname(path), {recursive: true})
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`
  const backup = `${path}.bak-${process.pid}-${Date.now()}`
  writeFileSync(
    temporary,
    `${JSON.stringify(value, null, 2)}\n`,
    {encoding: 'utf8', mode: 0o600},
  )
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

function severityOf(record) {
  const label = String(record.database_specific?.severity || '').toLowerCase()
  if (['critical', 'high', 'low'].includes(label)) return label
  if (label === 'moderate' || label === 'medium') return 'medium'
  let best = 0
  for (const severity of record.severity || []) {
    const numeric = String(severity?.score || '').match(/^(\d+(?:\.\d+)?)$/)
    if (numeric) best = Math.max(best, Number(numeric[1]))
  }
  if (best >= 9) return 'critical'
  if (best >= 7) return 'high'
  if (best > 0 && best < 4) return 'low'
  return 'medium'
}
