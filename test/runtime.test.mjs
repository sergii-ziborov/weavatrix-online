import assert from 'node:assert/strict'
import {spawn, spawnSync} from 'node:child_process'
import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import test from 'node:test'
import {fileURLToPath} from 'node:url'

const ENTRY = fileURLToPath(new URL('../bin/weavatrix-online.mjs', import.meta.url))

function start(repo, graphHome) {
  const child = spawn(process.execPath, [ENTRY, repo], {
    env: {...process.env, WEAVATRIX_GRAPH_HOME: graphHome, WEAVATRIX_PRECISION: 'off', WEAVATRIX_SYNC_URL: 'https://example.invalid/api/v1/sync'},
    stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
  })
  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  let buffer = '', stderr = '', nextId = 1
  const pending = new Map()
  child.stderr.on('data', (chunk) => { stderr += chunk })
  child.stdout.on('data', (chunk) => {
    buffer += chunk
    let newline
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline).trim(); buffer = buffer.slice(newline + 1)
      if (!line) continue
      const message = JSON.parse(line)
      const waiter = pending.get(message.id)
      if (!waiter) continue
      pending.delete(message.id); clearTimeout(waiter.timer)
      if (message.error) waiter.reject(new Error(message.error.message))
      else waiter.resolve(message.result)
    }
  })
  const request = (method, params = {}, timeoutMs = 90000) => new Promise((resolve, reject) => {
    const id = nextId++
    const timer = setTimeout(() => reject(new Error(`timeout: ${method}\n${stderr}`)), timeoutMs)
    pending.set(id, {resolve, reject, timer})
    child.stdin.write(`${JSON.stringify({jsonrpc: '2.0', id, method, params})}\n`)
  })
  const stop = () => new Promise((resolve) => { child.once('exit', resolve); child.stdin.end() })
  return {request, stop, stderr: () => stderr}
}

test('Online composes the MIT core catalog in-process and adds its own tools and skill', {timeout: 120000}, async () => {
  const parent = mkdtempSync(join(tmpdir(), 'weavatrix-online-runtime-'))
  const repo = join(parent, 'repo')
  mkdirSync(join(repo, 'src'), {recursive: true})
  writeFileSync(join(repo, 'src', 'main.js'), 'export const onlineComposition = true\n')
  assert.equal(spawnSync('git', ['init', '-q'], {cwd: repo, windowsHide: true}).status, 0)
  assert.equal(spawnSync('git', ['add', '.'], {cwd: repo, windowsHide: true}).status, 0)
  const server = start(repo, join(parent, 'graphs'))
  try {
    const initialized = await server.request('initialize', {protocolVersion: '2024-11-05', capabilities: {}, clientInfo: {name: 'test', version: '1'}})
    assert.deepEqual(initialized.serverInfo, {name: 'weavatrix-online', version: '0.1.0'})
    // Online is the top of the stack: core (34) + refactor (11) + online (5) = 50.
    assert.match(initialized.instructions, /profile=online; tools=50/)
    const listed = await server.request('tools/list')
    assert.equal(listed.tools.length, 50)
    // one representative from each layer: core, refactor (read-only + apply), online
    for (const name of ['graph_stats', 'run_audit', 'rename_symbol', 'move_symbol', 'apply_edit_plan', 'online_status', 'refresh_advisories', 'sync_graph']) {
      assert.ok(listed.tools.some((tool) => tool.name === name), name)
    }
    const extensions = listed._meta['weavatrix/runtime'].extensions
    const byName = new Map(extensions.map((extension) => [extension.name, extension]))
    assert.equal(byName.get('refactor').tools, 11, 'refactor layer exposes 11 tools')
    assert.equal(byName.get('weavatrix-online').tools, 5, 'online layer exposes 5 tools')
    const stats = await server.request('tools/call', {name: 'graph_stats', arguments: {output_format: 'json'}})
    assert.equal(stats.isError, undefined, server.stderr())
    const preview = await server.request('tools/call', {name: 'preview_sync', arguments: {output_format: 'json'}}, 120000)
    assert.equal(preview.isError, undefined, server.stderr())
    assert.equal(preview.structuredContent.result.networkRequestMade, false)
    assert.match(preview.content[0].text, /"networkRequestMade": false/)
  } finally {
    await server.stop()
    rmSync(parent, {recursive: true, force: true, maxRetries: 20, retryDelay: 50})
  }
})
