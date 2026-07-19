---
name: weavatrix-online
description: Use the expanded Weavatrix MCP with Cloud or licensed Enterprise sync, advisory refresh, and shared architecture contracts.
---

# Weavatrix Online

Use the MIT core tools for graph, LSP-backed impact, Health, dependencies,
duplicates and local architecture work. Use Online tools only when the user has
configured a Cloud or Enterprise endpoint and explicitly wants network work.

Before synchronization:

1. call `online_status` to inspect endpoint readiness;
2. call `preview_sync` and show the exact destination and bounded payload;
3. call `sync_graph` only after explicit approval, with `dry_run:false` and the
   returned confirmation token.

Missing remote evidence is UNKNOWN or NOT_CHECKED, never a clean zero.
