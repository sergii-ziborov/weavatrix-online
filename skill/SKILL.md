---
name: weavatrix-online
description: Use the expanded MIT Weavatrix MCP with Cloud or self-hosted sync, advisory refresh, dependency vulnerability matching, malware review, and shared architecture contracts.
---

# Weavatrix Online

Use the local tools for graph, LSP-backed impact, Health, dependencies,
duplicates and local architecture work. Use Online tools only when the user has
configured a Cloud or Enterprise endpoint and explicitly wants network work.

For dependency security review:

1. call `refresh_advisories` when current network evidence is required;
2. call `scan_dependency_vulnerabilities` to match the current inventory
   against the validated cache;
3. treat `NOT_CHECKED` and `PARTIAL` as incomplete, never as a clean zero;
4. call `scan_dependency_malware` only for bounded static review of installed
   packages; its findings are signals, never a compromise verdict.

Before synchronization:

1. call `online_status` to inspect endpoint readiness;
2. call `preview_sync` and show the exact destination and bounded payload;
3. call `sync_graph` only after explicit approval, with `dry_run:false` and the
   returned confirmation token.

Missing remote evidence is `NOT_CHECKED` or `PARTIAL`, never a clean zero.
