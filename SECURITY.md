# Security

Please report suspected vulnerabilities privately through GitHub Security
Advisories for this repository. Do not include credentials, customer data,
source code or graph payloads in a public issue.

The Online connector is the only Weavatrix package that may perform network
operations. Sync requires an explicit HTTPS destination, a scoped bearer token
and an exact preview confirmation hash. The MIT `weavatrix` core remains
network-free.
