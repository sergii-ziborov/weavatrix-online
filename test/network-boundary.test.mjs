import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import test from 'node:test'
import {syncDestination} from '../src/destination.mjs'
import {discoverEndpointCapabilities} from '../src/endpoint-capabilities.mjs'
import {createOnlineExtension} from '../src/extension.mjs'

test('Online owns the expanded network catalog while retaining core profiles underneath', () => {
  const extension = createOnlineExtension('0.1.0')
  assert.deepEqual(extension.tools.map((tool) => tool.name), [
    'online_status', 'refresh_advisories', 'pull_architecture_contract', 'preview_sync', 'sync_graph',
  ])
  assert.ok(extension.profiles.online.includes('graph'))
  assert.ok(extension.profiles.online.includes('health'))
  assert.ok(extension.profiles.online.includes('online-network'))
  assert.deepEqual(extension.skills.map((skill) => skill.name), ['weavatrix-online'])
})

test('destination policy requires HTTPS outside explicit loopback development', () => {
  assert.equal(syncDestination('https://cloud.example/api/sync').display, 'https://cloud.example/api/sync')
  assert.equal(syncDestination('http://127.0.0.1:8787/api/sync').url, 'http://127.0.0.1:8787/api/sync')
  assert.throws(() => syncDestination('http://cloud.example/api/sync'), /HTTPS/)
  assert.throws(() => syncDestination('https://user:secret@cloud.example/api/sync'), /embedded credentials/)
  assert.throws(() => syncDestination('https://cloud.example/api/sync#secret'), /fragment/)
})

test('capability discovery reports Cloud/Enterprise payload compatibility without repository evidence', async () => {
  const previousUrl = process.env.WEAVATRIX_SYNC_URL
  const previousFetch = globalThis.fetch
  process.env.WEAVATRIX_SYNC_URL = 'https://cloud.example/api/v1/sync'
  let request
  globalThis.fetch = async (url, options) => {
    request = {url: String(url), options}
    return new Response(JSON.stringify({
      schemaVersion: 'weavatrix.capabilities.v1',
      service: {kind: 'managed-cloud', product: 'weavatrix-hosted'},
      sync: {configured: true, payloadVersions: [2, 3], limits: {bodyBytes: 8}, evidenceSections: ['health']},
      authentication: {scheme: 'bearer'}, features: {architectureContracts: true},
      compatibility: {minimumCoreVersion: '0.3.0'},
    }), {status: 200, headers: {'content-type': 'application/json'}})
  }
  try {
    const result = await discoverEndpointCapabilities()
    assert.equal(result.ok, true)
    assert.equal(result.state, 'READY')
    assert.deepEqual(result.acceptedPayloadVersions, [2, 3])
    assert.equal(result.schemaVersion, 'weavatrix.capabilities.v1')
    assert.equal(request.url, 'https://cloud.example/api/v1/capabilities')
    assert.doesNotMatch(JSON.stringify(request.options), /repository|source|token|authorization/i)
  } finally {
    globalThis.fetch = previousFetch
    if (previousUrl === undefined) delete process.env.WEAVATRIX_SYNC_URL
    else process.env.WEAVATRIX_SYNC_URL = previousUrl
  }
})

test('license and package metadata keep both lower layers separate from Online source terms', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  const license = readFileSync(new URL('../LICENSE.md', import.meta.url), 'utf8')
  assert.equal(pkg.license, 'SEE LICENSE IN LICENSE.md')
  assert.equal(pkg.dependencies.weavatrix, '^0.3.14')
  assert.equal(pkg.dependencies['weavatrix-refactor'], '^0.1.2')
  assert.match(license, /does not apply to[\s\S]*separately distributed MIT-licensed[\s\S]*`weavatrix` core package/i)
  assert.match(license, /Apache-2\.0-licensed `weavatrix-refactor` package/i)
})
