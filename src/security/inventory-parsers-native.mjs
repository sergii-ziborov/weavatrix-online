import {packageFact, uniquePackages} from './inventory-model.mjs'

export function parseGoSum(text) {
  const out = []
  for (const raw of String(text || '').split(/\r?\n/)) {
    const match = raw.trim().match(/^(\S+)\s+v([\w.+-]+?)(\/go\.mod)?\s+h1:/)
    if (match && !match[3]) out.push(packageFact('Go', match[1], match[2], 'go-sum'))
  }
  return uniquePackages(out)
}

export function parseGoMod(text) {
  const out = []
  const source = String(text || '').replace(/\/\/[^\n]*/g, '')
  for (const match of source.matchAll(/(?:^|\n)\s*([A-Za-z0-9_.~/-]+)\s+v([\w.+-]+)/g)) {
    if (match[1] !== 'module' && match[1] !== 'go') {
      out.push(packageFact('Go', match[1], match[2], 'go-mod'))
    }
  }
  return uniquePackages(out)
}

export function parseCargoLock(text) {
  const out = []
  for (const block of String(text || '').split(/\[\[package\]\]/).slice(1)) {
    const name = block.match(/(?:^|\n)name\s*=\s*"([^"]+)"/)?.[1]
    const version = block.match(/(?:^|\n)version\s*=\s*"([^"]+)"/)?.[1]
    if (name && version) out.push(packageFact('crates.io', name, version, 'cargo-lock'))
  }
  return uniquePackages(out)
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
      packages.push(packageFact('Maven', `${group}:${artifact}`, version, 'maven-pom'))
    } else if (group && artifact) {
      unpinned += 1
    }
  }
  return {packages: uniquePackages(packages), unpinned}
}

export function parseGradleLock(text) {
  const out = []
  for (const raw of String(text || '').split(/\r?\n/)) {
    const match = raw.trim().match(/^([^:#\s]+):([^:#\s]+):([^=\s]+)(?:=.*)?$/)
    if (match) {
      out.push(packageFact('Maven', `${match[1]}:${match[2]}`, match[3], 'gradle-lock'))
    }
  }
  return uniquePackages(out)
}
