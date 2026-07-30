import {existsSync, readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import process from 'node:process'

const require = createRequire(import.meta.url)
const own = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'))
const server = JSON.parse(readFileSync(new URL('../server.json', import.meta.url), 'utf8'))
const architecture = JSON.parse(readFileSync(new URL('../.weavatrix/architecture.json', import.meta.url), 'utf8'))
const core = require('weavatrix-js/package.json')
const refactor = require('weavatrix-refactor/package.json')
const failures = []
const releaseNotes = new URL(`../docs/releases/v${own.version}.md`, import.meta.url)

if (own.private !== false) failures.push('package.json private must be false')
if (own.license !== 'MIT') failures.push('package.json license must be MIT')
if (own.dependencies?.['weavatrix-js'] !== '^0.3.15') failures.push(`weavatrix-js dependency must be ^0.3.15, found ${own.dependencies?.['weavatrix-js'] || '(missing)'}`)
if (own.dependencies?.['weavatrix-refactor'] !== '^0.1.3') failures.push(`weavatrix-refactor dependency must be ^0.1.3, found ${own.dependencies?.['weavatrix-refactor'] || '(missing)'}`)
if (!String(core.version).startsWith('0.3.')) failures.push(`weavatrix-js must be 0.3.x, found ${core.version}`)
if (!String(refactor.version).startsWith('0.1.')) failures.push(`weavatrix-refactor must be 0.1.x, found ${refactor.version}`)
if (lock.packages?.['']?.version !== own.version) failures.push('package-lock root version does not match package.json')
if (lock.packages?.['']?.license !== own.license) failures.push('package-lock root license does not match package.json')
if (lock.packages?.['node_modules/weavatrix-js']?.version !== core.version) failures.push('package-lock weavatrix-js version does not match the installed package')
if (server.version !== own.version || server.packages?.[0]?.version !== own.version) failures.push('MCP Registry metadata version does not match package.json')
if (server.name !== own.mcpName) failures.push('MCP Registry name does not match package mcpName')
if (server.description.length > 100) failures.push('MCP Registry description must be at most 100 characters')
if (architecture.enforcement !== 'strict') failures.push('architecture enforcement must be strict')
if (architecture.budgets?.runtimeCycles !== 0) failures.push('architecture runtime cycle budget must be zero')
if (architecture.budgets?.maxFileLoc !== 300) failures.push('architecture file budget must be 300')
if (architecture.budgets?.maxFunctionLoc !== 100) failures.push('architecture function budget must be 100')
if (architecture.exceptions?.length) failures.push('architecture exceptions must be empty')
if (architecture.ratchet?.baseline?.fingerprints?.length) failures.push('architecture violation baseline must be empty')
if (!existsSync(releaseNotes) || !readFileSync(releaseNotes, 'utf8').trim()) failures.push('checked-in release notes are missing or empty')
for (const required of ['LICENSE.md', 'README.md', 'server.json', '.weavatrix/architecture.json']) {
  if (!own.files?.includes(required)) failures.push(`published package files must include ${required}`)
}
if (!/^MIT License\r?\n/.test(readFileSync(new URL('../LICENSE.md', import.meta.url), 'utf8'))) {
  failures.push('LICENSE.md must contain the MIT License')
}
if (process.env.GITHUB_REF_TYPE === 'tag' && process.env.GITHUB_REF_NAME !== `v${own.version}`) {
  failures.push(`tag ${process.env.GITHUB_REF_NAME || '(missing)'} does not match package v${own.version}`)
}

if (failures.length) {
  process.stderr.write(`weavatrix-online is not publishable yet:\n- ${failures.join('\n- ')}\n`)
  process.exitCode = 1
} else {
  process.stdout.write(`release gate passed for weavatrix-online ${own.version} over weavatrix-js ${core.version}\n`)
}
