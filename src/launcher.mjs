import {readFileSync, statSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {startMcpServer} from 'weavatrix/mcp-runtime'
import {refactorExtension} from 'weavatrix-refactor/extension'
import {createOnlineExtension} from './extension.mjs'

const PACKAGE_URL = new URL('../package.json', import.meta.url)
const PACKAGE = JSON.parse(readFileSync(PACKAGE_URL, 'utf8'))

export function validateOnlineArgs(args, isDirectory = (path) => statSync(path).isDirectory()) {
  if (!Array.isArray(args) || args.length === 0) throw new Error('Usage: weavatrix-online <repoRoot> or weavatrix-online <graph.json> <repoRoot>')
  if (args.length > 2) throw new Error('weavatrix-online selects its composed Online profile; capability overrides are not accepted')
  if (isDirectory(args[0])) {
    if (args.length !== 1) throw new Error('The repository form accepts exactly one repository directory')
    return args
  }
  if (!args[1] || !isDirectory(args[1])) throw new Error('The explicit graph form requires an existing repository directory as its second argument')
  return args
}

export async function startOnlineMcp({argv = process.argv, isDirectory} = {}) {
  const args = validateOnlineArgs(argv.slice(2), isDirectory)
  const runtimeArgv = [argv[0], argv[1], ...args]
  return startMcpServer({
    argv: runtimeArgv,
    defaultCapabilities: 'online',
    // online ⊃ refactor ⊃ core: load the refactor extension too so Online also exposes every
    // refactoring tool, then Online's own network/planning tools on top.
    loadExtensions: async () => [refactorExtension(), createOnlineExtension(PACKAGE.version)],
    packageJsonPath: fileURLToPath(PACKAGE_URL),
    packageVersion: PACKAGE.version,
    serverInfo: {name: 'weavatrix-online', version: PACKAGE.version},
  })
}
