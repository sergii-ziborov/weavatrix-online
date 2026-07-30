# Security

Report suspected vulnerabilities privately through
[GitHub Security Advisories](https://github.com/sergii-ziborov/weavatrix-online/security/advisories/new).
Do not include credentials, customer data, source text, or graph payloads in a
public issue.

Weavatrix Online is the only package in its current JavaScript composition that
owns network workflows. It requires an HTTPS destination outside loopback,
rejects credentials embedded in URLs, negotiates endpoint capabilities, and
sends only the exact source-free body approved by a still-valid
`preview_sync` confirmation.

Keep `WEAVATRIX_SYNC_TOKEN` in runtime secret storage. Source writes require
`WEAVATRIX_ALLOW_SOURCE_EDITS=1` plus a plan-bound confirmation. Requested
allowlisted package scripts require `WEAVATRIX_ALLOW_TEST_RUNS=1`. Neither gate
should be enabled for a read-only session.

Advisory and malware results are evidence, not guarantees. Missing or stale
advisory coverage remains `NOT_CHECKED` or `PARTIAL`; static malware signals do
not prove execution, safety, credential exposure, or compromise.
