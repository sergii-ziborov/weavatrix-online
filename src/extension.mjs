import {DEFAULT_CAPS} from 'weavatrix-js/mcp-runtime'
import {defineWeavatrixExtension} from 'weavatrix-js/extension-api'
import {refreshAdvisories, scanDependencyVulnerabilities} from './actions/advisories.mjs'
import {pullArchitectureContract} from './actions/architecture.mjs'
import {scanDependencyMalwareTool} from './actions/malware.mjs'
import {previewSync, syncGraph} from './actions/sync.mjs'
import {onlineStatus} from './endpoint-capabilities.mjs'

const NETWORK_CAPABILITY = 'online-network'

export function createOnlineExtension(version) {
  return defineWeavatrixExtension({
    name: 'weavatrix-online',
    version,
    // 'edit' enables the refactor apply tools (gated by WEAVATRIX_ALLOW_SOURCE_EDITS at
    // runtime); the read-only refactor plan producers ride on the core 'graph' cap.
    profiles: {
      online: [...DEFAULT_CAPS, 'edit', NETWORK_CAPABILITY],
      cloud: [...DEFAULT_CAPS, 'edit', NETWORK_CAPABILITY],
      enterprise: [...DEFAULT_CAPS, 'edit', NETWORK_CAPABILITY],
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
        description: "NETWORK / explicit Online profile: inventory exact npm/PyPI/Go/Maven/Gradle/Cargo versions, query OSV, validate returned records in Online-owned code, and refresh Online's local advisory cache.",
        inputSchema: {type: 'object', properties: {timeout_ms: {type: 'integer', minimum: 1000, maximum: 120000, default: 20000}}},
        run: refreshAdvisories,
      },
      {
        cap: NETWORK_CAPABILITY,
        name: 'scan_dependency_vulnerabilities',
        description: 'LOCAL / explicit Online profile: match the current exact dependency inventory against the validated Online advisory cache. Missing, stale, partial, or inventory-mismatched cache state never produces a clean zero.',
        inputSchema: {type: 'object', properties: {
          max_age_days: {type: 'integer', minimum: 1, maximum: 365, default: 30},
        }},
        run: scanDependencyVulnerabilities,
      },
      {
        cap: NETWORK_CAPABILITY,
        name: 'scan_dependency_malware',
        description: 'LOCAL / explicit Online profile: bounded static heuristic review of installed dependency code. Returns review evidence and completeness only; never claims execution, credential exposure, or package compromise.',
        inputSchema: {type: 'object', properties: {
          max_packages: {type: 'integer', minimum: 1, maximum: 5000, default: 2000},
          max_files: {type: 'integer', minimum: 1, maximum: 100000, default: 50000},
          max_bytes: {type: 'integer', minimum: 1024, maximum: 268435456, default: 67108864},
          max_file_bytes: {type: 'integer', minimum: 1024, maximum: 4194304, default: 1048576},
          max_findings: {type: 'integer', minimum: 1, maximum: 1000, default: 500},
        }},
        run: scanDependencyMalwareTool,
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
    // Additional local analyzers can be registered here later. They augment run_audit and cannot
    // replace core providers; the extension API requires network:"none" for analyzer hooks.
    auditProviders: [],
    skills: [{name: 'weavatrix-online', path: 'skill/SKILL.md'}],
  })
}
