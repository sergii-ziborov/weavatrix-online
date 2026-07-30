import {readdirSync, realpathSync, statSync} from 'node:fs'
import {join, relative, resolve, sep} from 'node:path'

const SKIP = new Set([
  '.git', '.cache', 'docs', 'doc', 'examples', 'example',
  'test', 'tests', '__tests__', 'fixtures', 'coverage',
])

export function discoverDependencyPackages(repoRoot, maxPackages) {
  const root = realDirectory(repoRoot)
  const packages = []
  const roots = []
  const seen = new Set()
  const add = (path, name, kind) => {
    let real
    try {
      real = realpathSync(path)
    } catch {
      return
    }
    if (!inside(root, real) || seen.has(real) || packages.length >= maxPackages) return
    seen.add(real)
    packages.push({path: real, name, kind})
  }

  const nodeModules = findDirectories(root, (name) => name === 'node_modules', 8, 500)
  const moduleQueue = [...nodeModules]
  const seenModuleRoots = new Set()
  while (moduleQueue.length && packages.length < maxPackages) {
    const modules = moduleQueue.shift()
    let realModules
    try {
      realModules = realpathSync(modules)
    } catch {
      continue
    }
    if (!inside(root, realModules) || seenModuleRoots.has(realModules)) continue
    seenModuleRoots.add(realModules)
    roots.push({kind: 'npm', path: relative(root, modules).split(sep).join('/')})
    for (const entry of safeEntries(modules)) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue
      if (entry.name.startsWith('@')) {
        for (const child of safeEntries(join(modules, entry.name))) {
          if (!child.isDirectory()) continue
          const packagePath = join(modules, entry.name, child.name)
          add(packagePath, `${entry.name}/${child.name}`, 'npm')
          queueNestedModules(packagePath, moduleQueue)
        }
      } else {
        const packagePath = join(modules, entry.name)
        add(packagePath, entry.name, 'npm')
        queueNestedModules(packagePath, moduleQueue)
      }
    }
  }

  discoverPython(root, roots, add)
  const vendor = join(root, 'vendor')
  if (safeDirectory(vendor)) {
    roots.push({kind: 'go', path: 'vendor'})
    add(vendor, 'go-vendor', 'go')
  }
  return {
    packages,
    roots,
    truncated: packages.length >= maxPackages || moduleQueue.length > 0,
  }
}

function discoverPython(root, roots, add) {
  const virtualEnvironmentRoots = []
  for (const name of ['.venv', 'venv', 'env']) {
    const base = join(root, name)
    const windows = join(base, 'Lib', 'site-packages')
    if (safeDirectory(windows)) virtualEnvironmentRoots.push(windows)
    const lib = join(base, 'lib')
    for (const entry of safeEntries(lib)) {
      const path = join(lib, entry.name, 'site-packages')
      if (entry.isDirectory() && /^python/i.test(entry.name) && safeDirectory(path)) {
        virtualEnvironmentRoots.push(path)
      }
    }
  }
  for (const venv of virtualEnvironmentRoots) {
    roots.push({kind: 'python', path: relative(root, venv).split(sep).join('/')})
    for (const entry of safeEntries(venv)) {
      if (entry.isDirectory() && !entry.name.endsWith('.dist-info') && !entry.name.startsWith('.')) {
        add(join(venv, entry.name), entry.name, 'python')
      }
    }
  }
}

function findDirectories(root, predicate, maxDepth, maxResults) {
  const found = []
  const stack = [{path: root, depth: 0}]
  while (stack.length && found.length < maxResults) {
    const current = stack.pop()
    if (current.depth > maxDepth) continue
    for (const entry of safeEntries(current.path)) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) continue
      const path = join(current.path, entry.name)
      if (predicate(entry.name, path)) {
        found.push(path)
        if (entry.name === 'node_modules') continue
      }
      if (!SKIP.has(entry.name) && !entry.name.startsWith('.')) {
        stack.push({path, depth: current.depth + 1})
      }
    }
  }
  return found
}

function queueNestedModules(packagePath, queue) {
  const nested = join(packagePath, 'node_modules')
  if (safeDirectory(nested)) queue.push(nested)
}

function realDirectory(value) {
  if (!value) throw new Error('No repository root is active.')
  const path = realpathSync(resolve(value))
  if (!statSync(path).isDirectory()) throw new Error(`Repository root is not a directory: ${path}`)
  return path
}

function inside(root, path) {
  return path === root || path.startsWith(`${root}${sep}`)
}

function safeDirectory(path) {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

function safeEntries(path) {
  try {
    return readdirSync(path, {withFileTypes: true})
  } catch {
    return []
  }
}
