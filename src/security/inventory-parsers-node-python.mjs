import {normalizePyPi, packageFact, uniquePackages} from './inventory-model.mjs'

export function parsePackageLock(json) {
  const out = []
  if (json?.packages && typeof json.packages === 'object') {
    for (const [path, value] of Object.entries(json.packages)) {
      if (!path.includes('node_modules/') || !value?.version) continue
      const name = path.slice(path.lastIndexOf('node_modules/') + 13)
      if (name && !name.startsWith('.')) {
        out.push(packageFact('npm', name, value.version, 'package-lock'))
      }
    }
  } else {
    const visit = (dependencies) => {
      for (const [name, value] of Object.entries(dependencies || {})) {
        if (value?.version) out.push(packageFact('npm', name, value.version, 'package-lock'))
        visit(value?.dependencies)
      }
    }
    visit(json?.dependencies)
  }
  return uniquePackages(out)
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
    if (name) out.push(packageFact('npm', name, match[2], 'yarn-lock'))
  }
  return uniquePackages(out)
}

export function parsePnpmLock(text) {
  const out = []
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim().replace(/^['"]|['"]:?\s*$/g, '')
    let match = line.match(/^\/?(@[^/]+\/[^@/]+|[^@/:\s]+)@([0-9][^(:\s]*)/)
    if (!match) match = line.match(/^\/?(@[^/]+\/[^/]+|[^/:\s]+)\/([0-9][^:\s]*):?$/)
    if (match) out.push(packageFact('npm', match[1], match[2], 'pnpm-lock'))
  }
  return uniquePackages(out)
}

export function parseRequirements(text) {
  const packages = []
  let unpinned = 0
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.replace(/(^|\s)#.*$/, '').trim()
    if (!line || line.startsWith('-')) continue
    const match = line.match(/^([A-Za-z0-9][\w.-]*)\s*(===?|~=)\s*([\w.!+*-]+)/)
    if (match) {
      packages.push(packageFact('PyPI', normalizePyPi(match[1]), match[3].replace(/\.\*$/, ''), 'requirements'))
    } else if (/^[A-Za-z0-9][\w.-]*/.test(line)) {
      unpinned += 1
    }
  }
  return {packages: uniquePackages(packages), unpinned}
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
      out.push(packageFact('PyPI', normalizePyPi(name), versionMatch[1], 'python-lock'))
      name = ''
    }
  }
  return uniquePackages(out)
}

export function parsePipfileLock(json) {
  const out = []
  for (const section of ['default', 'develop']) {
    for (const [name, value] of Object.entries(json?.[section] || {})) {
      const version = String(value?.version || '').replace(/^==/, '')
      if (version) {
        out.push(packageFact('PyPI', normalizePyPi(name), version, 'pipfile-lock'))
      }
    }
  }
  return uniquePackages(out)
}
