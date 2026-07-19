# ADR 0001: Online overlay product boundary

Status: accepted for 0.1.0; supersedes any fork interpretation

## Decision

`weavatrix` is the MIT-licensed core of the whole product. It owns the graph,
parsers, bundled LSP, Health, dependency, duplicate, impact and local
architecture engine. The 0.3 offline artifact contains no outbound HTTP tool or
Hosted credential surface.

`weavatrix-online` is a separately versioned expanded overlay that depends on a
compatible `weavatrix` core package. It owns network transport, authentication,
endpoint capability negotiation, consent and online workflow composition, and
may add proprietary tools, skills and local analyzer providers. It never copies
or forks core implementation code and never replaces a core tool/provider.

One overlay build targets:

1. Weavatrix Cloud, the operator-managed multi-tenant service.
2. Weavatrix Enterprise, the licensed customer-controlled deployment.

Both use the same versioned source-free wire contract.

## Core update model

All graph/LSP/Health/analyzer improvements are implemented and released in the
MIT core first. Online consumes them through a reviewed dependency update and
compatibility tests. Online must not carry patched private copies of core files.

The core exposes a local extension API for MCP tools, packaged skill metadata,
local audit providers, source-free payload creation, package-coordinate
inventory and validated architecture/advisory cache writes. Those services
perform no network I/O. Online calls them and owns every HTTP request.

## Licensing

The Online overlay uses Weavatrix Online Source License 1.0 and requires
separate written permission for execution or other use. The independently
distributed `weavatrix` dependency remains MIT and is not relicensed.

GitHub-hosting rights to view or fork a public repository do not grant
permission to run the Online overlay.

## Release gates

The first Online version is `0.1.0`. It becomes public source-available only when:

- offline `weavatrix` 0.3 contains no network surface;
- Online owns all network implementations;
- Cloud and Enterprise pass the same wire-contract suite;
- dependency compatibility and license checks pass;
- counsel reviews the custom source license and contribution terms.
