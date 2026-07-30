# Weavatrix Online

**Take repository intelligence across a network without handing the network
your repository.**

[![npm](https://img.shields.io/npm/v/weavatrix-online)](https://www.npmjs.com/package/weavatrix-online)
[![CI](https://github.com/sergii-ziborov/weavatrix-online/actions/workflows/ci.yml/badge.svg)](https://github.com/sergii-ziborov/weavatrix-online/actions/workflows/ci.yml)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/sergii-ziborov/weavatrix-online/blob/main/LICENSE.md)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-339933)](https://nodejs.org/)

Weavatrix Online is the MIT-licensed MCP connector for Weavatrix Cloud and
compatible customer-controlled endpoints. It keeps analysis local, produces an
inspectable source-free payload, and requires an exact short-lived confirmation
before that payload can leave the machine.

The complete Online profile exposes **52 MCP tools**:

- 34 local repository-intelligence tools from `weavatrix-js`;
- 11 preview, apply, and rollback tools from `weavatrix-refactor`;
- 7 Online tools for endpoint discovery, advisories, malware review,
  architecture contracts, and controlled synchronization.

Installing or starting Online does not synchronize anything. `preview_sync`
makes no network request; `sync_graph` accepts only the still-valid preview for
the same repository, destination, payload, and graph.

## Choose the right Weavatrix package

| Product | Install | Boundary |
| --- | --- | --- |
| `weavatrix` | npm or Cargo | Native local-first MCP product. Both package managers distribute the same local Weavatrix server and engine. |
| `weavatrix-rust` | Cargo | Protocol-independent Rust repository-intelligence engine for library and CLI use; it does not own MCP transport. |
| `weavatrix-online` | npm | This optional network-capable MCP composition: local analysis and refactoring plus source-free Cloud/self-hosted workflows. |

Online currently composes the public JavaScript packages directly:

```text
weavatrix-online 0.3.1
  ├─ weavatrix-refactor 0.1.x
  └─ weavatrix-js 0.3.x
```

It does not proxy the native `weavatrix` executable and does not copy either
engine. Use `weavatrix` when the graph must remain entirely local. Use
`weavatrix-online` when endpoint status, remotely managed architecture
contracts, advisory refresh, or explicit source-free synchronization is part of
the workflow.

## Install and run

Run the pinned release without a global install:

```powershell
npx -y weavatrix-online@0.3.1 C:\path\to\repository
```

The command starts a stdio MCP server. The first positional argument is the
repository to analyze. An existing graph can be supplied explicitly:

```powershell
npx -y weavatrix-online@0.3.1 C:\graphs\repository\graph.json C:\path\to\repository
```

The npm package is intentionally an executable MCP product; it does not
advertise a nonexistent JavaScript library entry point.

### Codex

```toml
[mcp_servers.weavatrix_online]
command = "npx"
args = ["-y", "weavatrix-online@0.3.1", "C:\\path\\to\\repository"]

[mcp_servers.weavatrix_online.env]
WEAVATRIX_SYNC_URL = "https://app.weavatrix.com/api/v1/graphs/sync"
WEAVATRIX_SYNC_TOKEN = "load-from-runtime-secret-storage"
```

### Claude Desktop

```json
{
  "mcpServers": {
    "weavatrix-online": {
      "command": "npx",
      "args": [
        "-y",
        "weavatrix-online@0.3.1",
        "C:\\path\\to\\repository"
      ],
      "env": {
        "WEAVATRIX_SYNC_URL": "https://app.weavatrix.com/api/v1/graphs/sync",
        "WEAVATRIX_SYNC_TOKEN": "load-from-runtime-secret-storage"
      }
    }
  }
}
```

Keep bearer tokens in the MCP client's runtime secret storage. Do not put them
in Git, a committed `.env`, release logs, or checked-in MCP configuration.

## The seven Online tools

| Tool | Network | Evidence and effect |
| --- | --- | --- |
| `online_status` | Yes | Discovers endpoint capabilities, payload versions, limits, and auth mode without repository evidence. |
| `refresh_advisories` | Yes | Inventories exact dependency coordinates, queries OSV, validates returned records, and atomically refreshes the local cache. |
| `scan_dependency_vulnerabilities` | No | Matches the current inventory against that cache. Missing, stale, partial, or mismatched coverage remains `NOT_CHECKED` or `PARTIAL`. |
| `scan_dependency_malware` | No | Performs bounded static review of installed dependency files. Findings require review and are never a compromise verdict. |
| `pull_architecture_contract` | Yes | Fetches the owner-approved target for the active opaque repository ID, validates it, and updates the local graph cache. |
| `preview_sync` | No | Serializes the exact allowlisted payload, hashes it, and issues a five-minute confirmation token. |
| `sync_graph` | Yes | Sends only the payload approved by `preview_sync`; `dry_run:false` and the matching token are mandatory. |

The other 45 tools cover graphs, APIs, impact, architecture, dependency
evidence, duplicates, health, search, and transactional refactoring. See the
[JavaScript engine catalog](https://github.com/sergii-ziborov/weavatrix-js#tool-catalog)
and the
[Refactor documentation](https://github.com/sergii-ziborov/weavatrix-refactor#readme).

## Typical workflows

Check endpoint compatibility before doing any repository work:

```json
{"name":"online_status","arguments":{"timeout_ms":10000}}
```

Refresh advisory evidence, then evaluate it locally:

```json
{"name":"refresh_advisories","arguments":{"timeout_ms":20000}}
{"name":"scan_dependency_vulnerabilities","arguments":{"max_age_days":30}}
```

Review the exact upload without sending it:

```json
{"name":"preview_sync","arguments":{"payload_version":3}}
```

After a human or trusted controller approves the displayed destination, section
summary, counts, size, and body hash, use the returned token:

```json
{
  "name": "sync_graph",
  "arguments": {
    "payload_version": 3,
    "dry_run": false,
    "confirm_token": "token-returned-by-preview_sync",
    "timeout_ms": 30000
  }
}
```

Changing the graph, repository, destination, payload, or expiry state invalidates
that approval. A rejected or unavailable endpoint leaves the graph local.

## Network and consent boundary

```text
local repository
      │
      ▼
local graph + derived evidence
      │
      ▼
preview_sync ── inspect destination, sections, counts, size, and SHA-256
      │
      ▼
explicit approval
      │
      ▼
sync_graph ── capability negotiation ── approved endpoint
```

The connector enforces:

- HTTPS for every non-loopback destination;
- loopback-only HTTP for local development;
- no credentials embedded in URLs;
- endpoint capability negotiation before upload;
- a bounded versioned payload allowlist;
- exact preview hashing and a short-lived confirmation token;
- explicit gates for source edits and requested package scripts;
- honest `NOT_CHECKED` and `PARTIAL` states when evidence is incomplete.

The sync payload contains bounded graph topology and selected derived evidence.
It excludes source bodies, snippets, absolute host paths, environment values,
credentials, Git remotes, and fields outside the wire allowlist. “Source-free”
does not mean anonymous: review the displayed repository identity, destination,
counts, sections, and hash before approval.

## Configuration

| Variable | Required | Meaning |
| --- | --- | --- |
| `WEAVATRIX_SYNC_URL` | For Online network workflows | Cloud or compatible self-hosted sync endpoint. |
| `WEAVATRIX_SYNC_TOKEN` | For Cloud/authenticated endpoints | Scoped bearer token sent only to the approved endpoint. |
| `WEAVATRIX_CAPABILITIES_URL` | No | Explicit capability document; otherwise `/api/v1/capabilities` with legacy `/api/health` fallback. |
| `WEAVATRIX_ARCHITECTURE_URL` | No | Explicit owner-approved architecture-contract endpoint. |
| `WEAVATRIX_PRECISION` | No | Local semantic precision: `lsp` (default) or `off`. |
| `WEAVATRIX_ALLOW_SOURCE_EDITS` | No | Set to `1` only for a session authorized to apply or roll back previewed refactor plans. |
| `WEAVATRIX_ALLOW_TEST_RUNS` | No | Set to `1` only when the user also requests allowlisted `verified_change` package scripts. |
| `WEAVATRIX_GRAPH_HOME` | No | Override local graph/cache storage. |
| `WEAVATRIX_ADVISORY_STORE` | No | Override the local advisory-cache file. |

Compatible endpoints must implement the versioned capability and sync
contracts. Capability discovery itself sends no repository evidence.

## Security evidence without false certainty

Advisory refresh covers pinned npm, PyPI, Go, Maven/Gradle, and crates.io
coordinates found in bounded repository manifests. A clean zero is allowed only
when the current inventory matches a complete, current Online cache.

Malware review is static and bounded. It can identify evidence such as
download-and-execute lifecycle scripts, reverse-shell patterns, decoded
execution, miner indicators, credential-file reads, or suspicious exfiltration
endpoints. It cannot prove execution, provenance, credential exposure, safety,
or compromise.

Architecture contracts are validated locally before becoming active.
Refactoring remains preview-first; writes require both a plan-bound confirmation
token and `WEAVATRIX_ALLOW_SOURCE_EDITS=1`.

Report vulnerabilities privately through
[GitHub Security Advisories](https://github.com/sergii-ziborov/weavatrix-online/security/advisories/new).

## Architecture

The connector is a strict modular ports-and-adapters system:

```text
policy
  └─ discovery adapters
       └─ security cache and evidence services
            └─ Online actions
                 └─ MCP composition and executable
```

- `policy`: destination validation, version matching, inventory identities, and
  malware evidence rules;
- `discovery`: bounded manifest and installed-package adapters;
- `security`: atomic advisory state, cached matching, scanning, and reporting;
- `online-actions`: capability, contract, advisory, preview, and sync use cases;
- `composition`: extension registration, launcher, and stdio executable.

The checked-in
[architecture contract](.weavatrix/architecture.json) enforces zero runtime
cycles, production files at or below 300 physical lines, and functions at or
below 100 physical lines, with no exceptions and no violation baseline.

## Development and release proof

```powershell
npm ci --ignore-scripts
npm test
npm run verify:release
npm audit
npm pack --dry-run --json
```

The release gate verifies package identity, dependency ranges, exact installed
versions, MCP Registry metadata, checked-in release notes, MIT licensing, the
published file allowlist, and tag/version agreement. CI repeats the tests,
security audit, and package dry-run on Node.js 24.

## License

[MIT](LICENSE.md). Weavatrix Online, `weavatrix-js`, and
`weavatrix-refactor` are independently versioned MIT-licensed packages.
