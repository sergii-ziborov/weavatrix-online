export const OSV_ECOSYSTEMS = new Set(['npm', 'PyPI', 'Go', 'Maven', 'crates.io'])

export const normalizePyPi = (name) => String(name || '').toLowerCase().replace(/[-_.]+/g, '-')

export function packageFact(ecosystem, name, version, source) {
  return {
    ecosystem,
    name: String(name),
    version: String(version).replace(/^v(?=\d)/, ''),
    source,
  }
}

export function uniquePackages(items) {
  const seen = new Set()
  return items.filter((item) => {
    const key = `${item.ecosystem}|${item.name}|${item.version}`
    if (!item.name || !item.version || seen.has(key)) return false
    seen.add(key)
    return true
  })
}
