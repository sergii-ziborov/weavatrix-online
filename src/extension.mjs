import {DEFAULT_CAPS} from 'weavatrix/mcp-runtime'
import {defineWeavatrixExtension} from 'weavatrix/extension-api'
import {refreshAdvisories} from './actions/advisories.mjs'
import {pullArchitectureContract} from './actions/architecture.mjs'
import {previewSync, syncGraph} from './actions/sync.mjs'
import {onlineStatus} from './endpoint-capabilities.mjs'

const NETWORK_CAPABILITY = 'online-network'

export function createOnlineExtension(version) {
  return defineWeavatrixExtension({
    name: 'weavatrix-online',
    version,
    profiles: {
      online: [...DEFAULT_CAPS, NETWORK_CAPABILITY],
      cloud: [...DEFAULT_CAPS, NETWORK_CAPABILITY],
      enterprise: [...DEFAULT_CAPS, NETWORK_CAPABILITY],
    },
    tools: [
      {
        cap: NETWORK_CAPABILITY,
        name: 'online_status',
        description: 'NETWORK / explicit Online profile: discover the configured Cloud or Enterprise endpoint capabilities without sending repository evidence.',
        inputSchema: {type: 'object', properties: {timeout_ms: {type: 'integer', minimum: 1000, maximum: 120000, default: 10000}}},
        run: onlineStatus,
      },
      {
        cap: NETWORK_CAPABILITY,
        name: 'refresh_advisories',
        description: "NETWORK / explicit Online profile: query OSV for the active repo's concrete npm/PyPI/Go/Maven/Gradle/Cargo versions, validate results through the MIT core, and refresh its offline advisory cache.",
        inputSchema: {type: 'object', properties: {timeout_ms: {type: 'integer', minimum: 1000, maximum: 120000, default: 20000}}},
        run: refreshAdvisories,
      },
      {
        cap: NETWORK_CAPABILITY,
        name: 'pull_architecture_contract',
        description: 'NETWORK / explicit Online profile: fetch the owner-approved target architecture for the active opaque repository UUID, validate it through core and cache it locally.',
        inputSchema: {type: 'object', properties: {timeout_ms: {type: 'integer', minimum: 1000, maximum: 120000, default: 30000}}},
        run: pullArchitectureContract,
      },
      {
        cap: NETWORK_CAPABILITY,
        name: 'preview_sync',
        description: 'LOCAL CONSENT PREVIEW: serialize the exact bounded source-free payload and return a short-lived confirmation token. No network request is made.',
        inputSchema: {type: 'object', properties: {payload_version: {type: 'integer', enum: [2, 3], default: 3}}},
        run: previewSync,
      },
      {
        cap: NETWORK_CAPABILITY,
        name: 'sync_graph',
        description: 'NETWORK / explicit Online profile: upload only the exact source-free payload approved through preview_sync; dry_run:false and the matching short-lived token are required.',
        inputSchema: {type: 'object', properties: {
          payload_version: {type: 'integer', enum: [2, 3], default: 3},
          dry_run: {type: 'boolean', default: true},
          confirm_token: {type: 'string', maxLength: 64},
          timeout_ms: {type: 'integer', minimum: 1000, maximum: 120000, default: 30000},
        }},
        run: syncGraph,
      },
    ],
    // Proprietary local analyzers can be registered here later. They augment run_audit and cannot
    // replace core providers; the extension API requires network:"none" for analyzer hooks.
    auditProviders: [],
    skills: [{name: 'weavatrix-online', path: 'skill/SKILL.md'}],
  })
}
