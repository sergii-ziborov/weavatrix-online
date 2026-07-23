import assert from 'node:assert/strict'
import {existsSync, mkdtempSync, readFileSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import test from 'node:test'
import {pullArchitectureContract} from '../src/actions/architecture.mjs'

const CONTRACT = {
  architectureContractV: 1,
  name: 'Modular target',
  style: 'modular-monolith',
  enforcement: 'ratchet',
  components: [
    {id: 'ui', name: 'UI', paths: ['src/ui']},
    {id: 'domain', name: 'Domain', paths: ['src/domain']},
  ],
  dependencyRules: [{
    id: 'domain-no-ui', action: 'forbid', kinds: ['runtime'],
    from: ['domain'], to: ['ui'], reason: 'Keep domain independent',
  }],
  budgets: {runtimeCycles: 0, maxFunctionLoc: 300},
  technologies: {required: ['typescript'], forbidden: []},
  exceptions: [],
  ratchet: {baseline: {fingerprints: [], metrics: {}}},
}

test('pull_architecture_contract fetches, validates, caches, and reports ACTIVE', async () => {
  const root = mkdtempSync(join(tmpdir(), 'weavatrix-online-architecture-'))
  const previous = {
    graphHome: process.env.WEAVATRIX_GRAPH_HOME,
    syncUrl: process.env.WEAVATRIX_SYNC_URL,
    syncToken: process.env.WEAVATRIX_SYNC_TOKEN,
    architectureUrl: process.env.WEAVATRIX_ARCHITECTURE_URL,
    fetch: globalThis.fetch,
  }
  const graphPath = join(root, 'graphs', 'repo', 'graph.json')
  process.env.WEAVATRIX_GRAPH_HOME = join(root, 'registry')
  process.env.WEAVATRIX_SYNC_URL = 'https://cloud.example/api/v1/sync'
  process.env.WEAVATRIX_SYNC_TOKEN = 'test-token'
  delete process.env.WEAVATRIX_ARCHITECTURE_URL
  let request
  globalThis.fetch = async (url, options) => {
    request = {url: String(url), options}
    return new Response(JSON.stringify({state: 'ACTIVE', contract: CONTRACT}), {
      status: 200, headers: {'content-type': 'application/json'},
    })
  }
  try {
    const result = await pullArchitectureContract(null, {}, {repoRoot: root, graphPath})
    assert.equal(result.result.state, 'ACTIVE')
    assert.equal(result.result.status, 'PULLED')
    assert.equal(result.result.cacheChanged, true)
    assert.match(result.result.contractHash, /^[a-f0-9]{64}$/)
    assert.equal(result.completeness.status, 'COMPLETE')
    assert.equal(request.url, 'https://cloud.example/api/v1/architecture-contract')
    assert.equal(request.options.headers.authorization, 'Bearer test-token')
    assert.match(request.options.headers['x-weavatrix-repository-id'], /^[a-f0-9-]{36}$/)
    const cachePath = join(root, 'graphs', 'repo', 'architecture.contract.json')
    assert.equal(existsSync(cachePath), true)
    const cached = JSON.parse(readFileSync(cachePath, 'utf8'))
    assert.equal(cached.name, 'Modular target')
    assert.equal(cached.dependencyRules[0].id, 'domain-no-ui')
  } finally {
    globalThis.fetch = previous.fetch
    for (const [key, value] of [
      ['WEAVATRIX_GRAPH_HOME', previous.graphHome],
      ['WEAVATRIX_SYNC_URL', previous.syncUrl],
      ['WEAVATRIX_SYNC_TOKEN', previous.syncToken],
      ['WEAVATRIX_ARCHITECTURE_URL', previous.architectureUrl],
    ]) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    rmSync(root, {recursive: true, force: true})
  }
})
