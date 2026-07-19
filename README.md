# Weavatrix Online

Online MCP overlay for Weavatrix Cloud and licensed Weavatrix Enterprise
deployments. The separately versioned MIT `weavatrix` package is its core.

`weavatrix-online` is a separate product from the MIT-licensed, offline-first
[`weavatrix`](https://github.com/sergii-ziborov/weavatrix) engine. It starts at
version `0.1.0`; the offline package keeps its own version history and its MIT
license unchanged.

## Status

Version 0.1.0 is the first source-available Online overlay for Weavatrix 0.3.
The package is public so its source and MCP metadata can be inspected; the
permission-required license does not grant installation, execution, testing,
deployment, copying or modification rights. Request a written evaluation or
commercial license before using it.

Version 0.1.0 composes the stable core runtime in-process. It owns:

- advisory refresh;
- local sync preview and exact-payload confirmation;
- graph sync;
- target-architecture contract pull;
- Cloud/Enterprise endpoint authentication and capability negotiation.

Revision-bound GraphQL, gRPC and Kafka/event runtime reports are interpreted by
the MIT core. Online may acquire or normalize those source-free artifacts from
an authorized Cloud/Enterprise endpoint, but it does not carry a private copy
of the transport analyzer.

Online is an expanded superset, not merely a transport shim. It can add its
own proprietary MCP tools, packaged skills and local analyzer providers through
the core extension API. Those additions augment the baseline; they do not
replace or privately patch core graph, parser, LSP or Health implementations.

The MIT package will retain local advisory matching, graph building, Health,
duplicates, blast radius, architecture rules and all other offline analysis.

## Product endpoints

The same source-free wire contract targets either:

- Weavatrix Cloud, operated as a multi-tenant SaaS; or
- Weavatrix Enterprise, installed in a customer's environment under a
  commercial license.

The connector never grants an operator access to customer source. Tenant and
deployment authorization is enforced by the selected endpoint.

## Development bootstrap

```powershell
npm install
npm test
node bin/weavatrix-online.mjs C:\path\to\repo
```

Core improvements are always implemented in the MIT `weavatrix` repository
first. Online receives them through an explicit compatible dependency update;
it does not copy or fork the graph, parser, LSP or baseline Health implementation.

## Licensing

The original overlay code uses the permission-required
[Weavatrix Online Source License 1.0](LICENSE.md); commercial terms are
described in [COMMERCIAL-LICENSE.md](COMMERCIAL-LICENSE.md). The separately
installed `weavatrix` dependency remains MIT and is not relicensed here.

The repository is source-available, not open source as a whole. The included
license is the operative permission boundary; obtain legal advice before
relying on it for a particular commercial arrangement.
