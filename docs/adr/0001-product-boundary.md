# ADR 0001: Online connector product boundary

Status: accepted; revised for 0.3.1

## Decision

`weavatrix-online` is the independently versioned MIT MCP product that owns
Weavatrix network behavior. It composes the public `weavatrix-js` repository
engine and `weavatrix-refactor` extension in-process, then adds a small explicit
Online surface.

The complete profile has 52 tools:

1. 34 local repository-intelligence tools from `weavatrix-js`;
2. 11 refactor planning, apply, and rollback tools from
   `weavatrix-refactor`;
3. 7 Online tools implemented here.

Online owns destination validation, endpoint capability negotiation,
authentication headers, architecture-contract retrieval, OSV advisory refresh,
installed-package malware review, consent previews, and synchronization.
Neither dependency may silently perform those network workflows on Online's
behalf.

## Distribution boundary

The native `weavatrix` MCP product is distributed through both npm and Cargo.
Those are two installation paths for the same local-first native product.
`weavatrix-rust` is its protocol-independent engine and does not own MCP
transport.

`weavatrix-online` is a separate npm package. It does not proxy the native
binary and does not import the canonical package by name. Its current,
verified composition is:

```text
weavatrix-online
  ├─ weavatrix-refactor
  └─ weavatrix-js
```

No migration promise is part of this boundary. A future implementation change
must preserve the public tool, consent, security, and wire contracts and pass a
separate release review.

## Endpoint boundary

One connector build targets:

1. Weavatrix Cloud, the operator-managed service;
2. compatible customer-controlled deployments.

Both use the same versioned capability and source-free sync contracts. HTTP is
allowed only for explicit loopback development; every non-loopback destination
must use HTTPS.

`preview_sync` performs no network request. `sync_graph` can send only the exact
allowlisted body approved for the same repository, graph, destination, payload
version, and five-minute confirmation window.

## Security ownership

Online owns exact package inventory across the supported lock/manifests,
validated advisory-cache state, current-inventory matching, and bounded static
malware evidence. Missing, stale, partial, or mismatched evidence cannot produce
a clean zero.

Static malware findings are review signals. They never assert package origin,
execution, credential exposure, safety, or compromise.

Source writes remain a separate Refactor capability and require both a
plan-bound confirmation and `WEAVATRIX_ALLOW_SOURCE_EDITS=1`. Allowlisted
package scripts require an explicit tool argument and
`WEAVATRIX_ALLOW_TEST_RUNS=1`.

## Core update model

Graph, parser, LSP, Health, impact, duplicate, search, and local architecture
improvements are released in the appropriate MIT core package first. Online
consumes reviewed dependency releases and must not carry patched private copies
of core implementation files.

The core extension API supplies local graph services, source-free payload
creation, architecture-contract normalization, and MCP composition hooks.
Online supplies all HTTP requests and Online-specific security storage.

## Architecture and release gates

Online follows the checked-in strict modular ports-and-adapters contract:

```text
policy -> discovery -> security services -> Online actions -> MCP composition
```

Releases require:

- zero runtime architecture cycles;
- production files at or below 300 physical lines;
- production functions at or below 100 physical lines;
- no architecture exceptions or violation baseline;
- exact dependency, package-lock, MCP metadata, and release-note versions;
- MIT metadata and license text;
- passing runtime, consent-boundary, architecture, and security tests;
- a clean npm audit and reviewed packed-file list.
