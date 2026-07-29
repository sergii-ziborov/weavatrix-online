# ADR 0001: Online overlay product boundary

Status: accepted for 0.1.0; supersedes any fork interpretation

## Decision

`weavatrix-js` is the MIT-licensed engine used by the current Online
composition. It owns the graph,
parsers, bundled LSP, Health, dependency, duplicate, impact and local
architecture engine. The 0.3 offline artifact contains no outbound HTTP tool or
Hosted credential surface.

`weavatrix-online` is a separately versioned expanded overlay that depends on a
compatible `weavatrix-js` package through `weavatrix-refactor`. It owns network transport, authentication,
endpoint capability negotiation, consent and online workflow composition, and
may add Online-specific tools, skills and local analyzer providers. It never copies
or forks core implementation code and never replaces a core tool/provider.

One overlay build targets:

1. Weavatrix Cloud, the operator-managed multi-tenant service.
2. Compatible customer-controlled deployments.

Both use the same versioned source-free wire contract.

The canonical native `weavatrix` package is an independent offline product in
this release line. Online and Refactor will move to Rust in a later, separately
verified migration; the current JS composition does not import the canonical
package by name.

## Core update model

All graph/LSP/Health/analyzer improvements are implemented and released in the
MIT core first. Online consumes them through a reviewed dependency update and
compatibility tests. Online must not carry patched private copies of core files.

The core exposes a local extension API for MCP tools, packaged skill metadata,
local audit providers, source-free payload creation, package-coordinate
inventory and validated architecture/advisory cache writes. Those services
perform no network I/O. Online calls them and owns every HTTP request.

## Licensing

The Online overlay is MIT-licensed. Its independently distributed
`weavatrix-js` and `weavatrix-refactor` dependencies are also MIT-licensed
packages with their own version histories.

## Release gates

Online releases are publishable only when:

- offline `weavatrix-js` 0.3 contains no network or dependency-security scanner surface;
- Online owns all network implementations;
- Cloud and Enterprise pass the same wire-contract suite;
- dependency compatibility and MIT license checks pass;
- release notes, registry metadata, tests, and the packed file list agree.
