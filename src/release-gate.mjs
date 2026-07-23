import {existsSync, readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import process from 'node:process'

const require = createRequire(import.meta.url)
const own = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'))
const server = JSON.parse(readFileSync(new URL('../server.json', import.meta.url), 'utf8'))
const core = require('weavatrix/package.json')
const refactor = require('weavatrix-refactor/package.json')
const failures = []
const releaseNotes = new URL(`../docs/releases/v${own.version}.md`, import.meta.url)

if (own.private !== false) failures.push('package.json private must be false')
if (own.license !== 'SEE LICENSE IN LICENSE.md') failures.push('package.json must point at the permission-required source license')
if (own.dependencies?.weavatrix !== '^0.3.14') failures.push(`Weavatrix dependency must be ^0.3.14, found ${own.dependencies?.weavatrix || '(missing)'}`)
if (own.dependencies?.['weavatrix-refactor'] !== '^0.1.2') failures.push(`weavatrix-refactor dependency must be ^0.1.2, found ${own.dependencies?.['weavatrix-refactor'] || '(missing)'}`)
if (!String(core.version).startsWith('0.3.')) failures.push(`Weavatrix core must be 0.3.x, found ${core.version}`)
if (!String(refactor.version).startsWith('0.1.')) failures.push(`weavatrix-refactor must be 0.1.x, found ${refactor.version}`)
if (lock.packages?.['']?.version !== own.version) failures.push('package-lock root version does not match package.json')
if (lock.packages?.['']?.license !== own.license) failures.push('package-lock root license does not match package.json')
if (lock.packages?.['node_modules/weavatrix']?.version !== core.version) failures.push('package-lock core version does not match the installed core')
if (server.version !== own.version || server.packages?.[0]?.version !== own.version) failures.push('MCP Registry metadata version does not match package.json')
if (server.name !== own.mcpName) failures.push('MCP Registry name does not match package mcpName')
if (!existsSync(releaseNotes) || !readFileSync(releaseNotes, 'utf8').trim()) failures.push('checked-in release notes are missing or empty')
for (const required of ['LICENSE.md', 'COMMERCIAL-LICENSE.md', 'README.md', 'server.json']) {
  if (!own.files?.includes(required)) failures.push(`published package files must include ${required}`)
}
if (process.env.GITHUB_REF_TYPE === 'tag' && process.env.GITHUB_REF_NAME !== `v${own.version}`) {
  failures.push(`tag ${process.env.GITHUB_REF_NAME || '(missing)'} does not match package v${own.version}`)
}

if (failures.length) {
  process.stderr.write(`weavatrix-online is not publishable yet:\n- ${failures.join('\n- ')}\n`)
  process.exitCode = 1
} else {
  process.stdout.write(`release gate passed for weavatrix-online ${own.version} over Weavatrix ${core.version}\n`)
}
