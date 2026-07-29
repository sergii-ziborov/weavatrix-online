export function parseVersion(value) {
  let source = String(value || '').trim().replace(/^[v=]/, '')
  let epoch = 0
  const epochMatch = source.match(/^(\d+)!(.*)$/)
  if (epochMatch) {
    epoch = Number(epochMatch[1])
    source = epochMatch[2]
  }
  source = source.split('+')[0]
  const dash = source.indexOf('-')
  const core = dash < 0 ? source : source.slice(0, dash)
  const pre = dash < 0 ? [] : source.slice(dash + 1).split('.').filter(Boolean)
  const numbers = core.split('.').map((item) => {
    const number = Number.parseInt(item, 10)
    return Number.isFinite(number) ? number : 0
  })
  return {epoch, numbers, pre}
}

export function compareVersions(left, right) {
  const a = parseVersion(left)
  const b = parseVersion(right)
  if (a.epoch !== b.epoch) return a.epoch - b.epoch
  for (let index = 0; index < Math.max(a.numbers.length, b.numbers.length); index += 1) {
    const difference = (a.numbers[index] || 0) - (b.numbers[index] || 0)
    if (difference) return difference
  }
  if (!a.pre.length && b.pre.length) return 1
  if (a.pre.length && !b.pre.length) return -1
  for (let index = 0; index < Math.max(a.pre.length, b.pre.length); index += 1) {
    const x = a.pre[index]
    const y = b.pre[index]
    if (x === undefined) return -1
    if (y === undefined) return 1
    const xNumeric = /^\d+$/.test(x)
    const yNumeric = /^\d+$/.test(y)
    if (xNumeric && yNumeric && Number(x) !== Number(y)) return Number(x) - Number(y)
    if (xNumeric !== yNumeric) return xNumeric ? -1 : 1
    if (x !== y) return x < y ? -1 : 1
  }
  return 0
}

export function isVersionAffected(version, affected = {}) {
  if (Array.isArray(affected.versions)) {
    const normalized = String(version).replace(/^v/, '')
    if (affected.versions.some((item) => String(item).replace(/^v/, '') === normalized)) {
      return {hit: true, matchedBy: 'versions', confidence: 'high'}
    }
  }
  for (const range of affected.ranges || []) {
    if (!range || range.type === 'GIT') continue
    let active = false
    for (const event of range.events || []) {
      if (event.introduced !== undefined) {
        active = event.introduced === '0' || compareVersions(version, event.introduced) >= 0
      } else if (event.fixed !== undefined) {
        if (active && compareVersions(version, event.fixed) < 0) {
          return {hit: true, matchedBy: 'range', confidence: 'medium'}
        }
        active = false
      } else if (event.last_affected !== undefined) {
        if (active && compareVersions(version, event.last_affected) <= 0) {
          return {hit: true, matchedBy: 'range', confidence: 'medium'}
        }
        active = false
      }
    }
    if (active) return {hit: true, matchedBy: 'range-open', confidence: 'medium'}
  }
  return {hit: false}
}

export function matchAdvisories(packages, query) {
  const matches = []
  const seen = new Set()
  for (const pkg of packages || []) {
    for (const advisory of query(pkg.ecosystem, pkg.name) || []) {
      const key = `${advisory.id}|${pkg.ecosystem}|${pkg.name}|${pkg.version}`
      if (seen.has(key)) continue
      if ((advisory.queriedVersions || []).some((version) => String(version) === String(pkg.version))) {
        seen.add(key)
        matches.push({
          pkg,
          advisory,
          matchedBy: 'osv-querybatch',
          confidence: 'high',
        })
        continue
      }
      const match = isVersionAffected(pkg.version, advisory.affected)
      if (!match.hit) continue
      seen.add(key)
      matches.push({
        pkg,
        advisory,
        matchedBy: match.matchedBy,
        confidence: match.confidence,
      })
    }
  }
  return matches
}
