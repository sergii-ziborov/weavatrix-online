# Weavatrix Online

**Take repository intelligence across the network without accidentally sending
the repository.**

[![npm](https://img.shields.io/npm/v/weavatrix-online)](https://www.npmjs.com/package/weavatrix-online)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/sergii-ziborov/weavatrix-online/blob/main/LICENSE.md)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-339933)](https://nodejs.org/)

Weavatrix Online is the public MIT-licensed MCP connector for Weavatrix Cloud
and customer-controlled endpoints. It combines the local repository graph,
transactional refactoring, dependency-security review, architecture contracts,
and an explicit preview-before-sync workflow in one server.

The complete Online profile exposes **52 MCP tools**:

- 34 read-only repository-intelligence tools from `weavatrix-js`;
- 11 preview, apply, and rollback tools from `weavatrix-refactor`;
- 7 Online tools for endpoint status, advisories, malware review,
  architecture contracts, and controlled synchronization.

Online currently composes the JavaScript engine so the network boundary stays
isolated and reviewable:

```text
weavatrix-online 0.3.0
  -> weavatrix-refactor 0.1.3
    -> weavatrix-js 0.3.15
```

The native `weavatrix` package is the separate offline Rust product.

## Install

Run it without a global install:

```powershell
npx -y weavatrix-online@0.3.0 C:\path\to\repository
```

Codex configuration:

```toml
[mcp_servers.weavatrix_online]
command = "npx"
args = ["-y", "weavatrix-online@0.3.0", "C:\\path\\to\\repository"]

[mcp_servers.weavatrix_online.env]
WEAVATRIX_SYNC_URL = "https://app.weavatrix.com/api/v1/graphs/sync"
WEAVATRIX_SYNC_TOKEN = "use-runtime-secret-storage"
```

Claude Desktop configuration:

```json
{
  "mcpServers": {
    "weavatrix-online": {
      "command": "npx",
      "args": [
        "-y",
        "weavatrix-online@0.3.0",
        "C:\\path\\to\\repository"
      ],
      "env": {
        "WEAVATRIX_SYNC_URL": "https://app.weavatrix.com/api/v1/graphs/sync",
        "WEAVATRIX_SYNC_TOKEN": "use-runtime-secret-storage"
      }
    }
  }
}
```

Keep bearer tokens in the client's secret/runtime storage. Do not commit them
to a repository, `.env` file, or MCP configuration checked into Git.

## What the seven Online tools do

| Tool | Network | Result |
| --- | --- | --- |
| `online_status` | Yes | Discovers endpoint capabilities and accepted payload versions without sending repository evidence. |
| `refresh_advisories` | Yes | Queries OSV for exact dependency coordinates, validates the response, and refreshes the local advisory cache. |
| `scan_dependency_vulnerabilities` | No | Matches the dependency inventory against the validated cache. Missing or stale coverage remains `NOT_CHECKED` or `PARTIAL`. |
| `scan_dependency_malware` | No | Performs bounded static review of installed dependency files. Signals require review; they are not a compromise verdict. |
| `pull_architecture_contract` | Yes | Fetches and validates the owner-approved target architecture for the active opaque repository ID. |
| `preview_sync` | No | Builds the exact bounded, source-free payload and a short-lived confirmation token. Nothing is sent. |
| `sync_graph` | Yes | Sends only the payload approved by `preview_sync`, with `dry_run:false` and the matching token. |

The other 45 tools cover repository graphs, APIs, impact, architecture,
dependencies, duplicates, health, search, and transactional refactoring. See
the [Core tool catalog](https://github.com/sergii-ziborov/weavatrix-js#tool-catalog)
and the
[Refactor README](https://github.com/sergii-ziborov/weavatrix-refactor#readme).

## The network boundary

No sync happens merely because Online is installed or started.

```text
online_status
    |
    v
preview_sync  -> inspect destination + exact source-free payload
    |
    v
explicit approval
    |
    v
sync_graph(dry_run: false, confirmation_token: ...)
```

The connector enforces:

- HTTPS for every non-loopback destination;
- no credentials embedded in URLs;
- endpoint capability negotiation before upload;
- a bounded, source-free graph payload;
- an exact preview hash and short-lived confirmation token;
- explicit authorization for requested test scripts;
- `NOT_CHECKED`/`PARTIAL` when remote security evidence is unavailable.

Loopback HTTP is accepted only for local development, for example
`http://127.0.0.1:8787`.

## Configuration

| Variable | Required | Meaning |
| --- | --- | --- |
| `WEAVATRIX_SYNC_URL` | Yes for sync | Cloud or self-hosted sync endpoint. |
| `WEAVATRIX_SYNC_TOKEN` | Yes for authenticated endpoints | Scoped bearer token. |
| `WEAVATRIX_CAPABILITIES_URL` | No | Explicit capability-document URL; defaults to `/api/v1/capabilities` on the sync origin. |
| `WEAVATRIX_ARCHITECTURE_URL` | No | Explicit architecture-contract URL. |
| `WEAVATRIX_PRECISION` | No | Core semantic precision: `lsp` (default) or `off`. |
| `WEAVATRIX_ALLOW_TEST_RUNS` | No | Set to `1` only when the user authorizes requested `verified_change` package scripts. |

Supported targets include Weavatrix Cloud and compatible customer-controlled
deployments that implement the versioned capability and sync contracts.

## Security evidence is honest

Online does not turn missing remote data into a reassuring zero.

- Advisory matching reports incomplete ecosystems and stale caches.
- Malware review is bounded static evidence, not a declaration that a package
  is safe or compromised.
- Architecture contracts are validated locally before they enter the graph.
- Source text, file contents, credentials, and unbounded arbitrary metadata are
  excluded from the synchronization payload.

Security issues should be reported privately through
[GitHub Security Advisories](https://github.com/sergii-ziborov/weavatrix-online/security/advisories/new).

## Development and release verification

```powershell
npm install
npm test
npm run verify:release
npm pack --dry-run
```

Release gates verify package identity, dependency versions, MCP Registry
metadata, checked-in release notes, the MIT license, and the published file
list.

## License

[MIT](LICENSE.md). The public connector, the Refactor layer, and the JavaScript
engine can be used, modified, and redistributed under their respective MIT
licenses.
