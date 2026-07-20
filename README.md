# Weavatrix Online

Online MCP overlay for Weavatrix Cloud and licensed Weavatrix Enterprise
deployments. It composes the separately versioned, MIT-licensed, offline-first
[`weavatrix`](https://github.com/sergii-ziborov/weavatrix) engine in-process and
owns every outbound capability. The offline package keeps its own version
history and its MIT license unchanged.

`weavatrix-online` starts at version `0.1.0` and tracks Weavatrix Core `0.3.x`
through explicit, compatible dependency updates — it never forks or privately
patches the Core graph, parser, LSP or Health implementations.

## What Online adds

Online exposes five tools on top of every offline Core tool, all gated behind
the explicit `online` capability profile. Nothing leaves the machine without a
local preview and an explicit confirmation.

| Tool | Network | Purpose |
| --- | --- | --- |
| `online_status` | yes | Discover the configured endpoint's capabilities and accepted payload versions. Sends no repository evidence. |
| `refresh_advisories` | yes | Query OSV for the active repo's exact npm/PyPI/Go/Maven/Gradle/Cargo versions, validate through Core, refresh the offline advisory cache. |
| `pull_architecture_contract` | yes | Fetch the owner-approved target architecture for the active opaque repository UUID, validate through Core, cache it locally. |
| `preview_sync` | no | Serialize the exact, bounded, source-free payload and return a short-lived confirmation token. No request is made. |
| `sync_graph` | yes | Upload only the payload approved by `preview_sync`; requires `dry_run:false` and the matching token. |

Missing remote evidence stays UNKNOWN / NOT_CHECKED, never a clean zero. The
packaged agent skill (`skill/SKILL.md`) tells assistants to run
`online_status` → `preview_sync` → `sync_graph` in that order.

## Configuration (sync targets)

Online reaches a destination only when it is explicitly configured through
environment variables:

| Variable | Meaning |
| --- | --- |
| `WEAVATRIX_SYNC_URL` | Destination sync endpoint, e.g. `https://app.weavatrix.com/api/v1/graphs/sync`. HTTPS is required except for loopback. |
| `WEAVATRIX_SYNC_TOKEN` | Bearer credential issued by the endpoint. Never embed credentials in the URL. |
| `WEAVATRIX_CAPABILITIES_URL` | Optional explicit capabilities document URL. Defaults to `/api/v1/capabilities` on the sync origin. |

Supported destinations:

- **Weavatrix Cloud** — `https://app.weavatrix.com`, the multi-tenant SaaS workbench.
- **Weavatrix Enterprise** — a customer-hosted deployment under commercial license.
- **Local development / self-host** — a loopback origin such as
  `http://127.0.0.1:8787` is the one case where plain HTTP is accepted, so the
  hosted app can be run and exercised locally under `wrangler dev`.

The connector never grants an endpoint operator access to customer source;
tenant and deployment authorization is enforced by the selected endpoint.

## Status

Version 0.1.0 is the first source-available Online overlay for Weavatrix 0.3. It
owns advisory refresh, local sync preview + exact-payload confirmation, graph
sync, target-architecture contract pull, and Cloud/Enterprise endpoint
authentication + capability negotiation. It can register its own proprietary MCP
tools, packaged skills and local analyzer providers through the Core extension
API; those augment the baseline and never replace Core providers.

## Development bootstrap

```powershell
npm install
npm test
node bin/weavatrix-online.mjs C:\path\to\repo
```

Core improvements land in the MIT `weavatrix` repository first; Online receives
them through an explicit compatible dependency update.

## Licensing

The overlay code uses the permission-required
[Weavatrix Online Source License 1.0](LICENSE.md); commercial terms are in
[COMMERCIAL-LICENSE.md](COMMERCIAL-LICENSE.md). The separately installed
`weavatrix` dependency remains MIT and is not relicensed here. The repository is
source-available, not open source as a whole; obtain legal advice before relying
on it for a particular commercial arrangement.
