import {syncDestination} from './destination.mjs'

export async function discoverEndpointCapabilities({timeoutMs = 10000} = {}) {
  const syncUrl = process.env.WEAVATRIX_SYNC_URL
  if (!syncUrl) return {ok: false, state: 'NOT_CONFIGURED', error: 'WEAVATRIX_SYNC_URL is not set'}
  let url
  const explicit = process.env.WEAVATRIX_CAPABILITIES_URL
  try {
    url = syncDestination(explicit || new URL('/api/v1/capabilities', syncUrl).toString()).url
  } catch (error) { return {ok: false, state: 'INVALID_CONFIGURATION', error: error.message} }
  try {
    let response = await fetch(url, {headers: {accept: 'application/json'}, signal: AbortSignal.timeout(timeoutMs)})
    if (!explicit && response.status === 404) {
      url = syncDestination(new URL('/api/health', syncUrl).toString()).url
      response = await fetch(url, {headers: {accept: 'application/json'}, signal: AbortSignal.timeout(timeoutMs)})
    }
    const body = await response.json().catch(() => null)
    if (response.ok && body?.schemaVersion === 'weavatrix.capabilities.v1') {
      const versions = Array.isArray(body.sync?.payloadVersions) ? body.sync.payloadVersions.map(Number).filter(Number.isInteger) : []
      return {
        ok: true,
        state: body.sync?.configured === false ? 'SYNC_NOT_READY' : 'READY',
        service: String(body.service?.product || 'unknown'),
        serviceKind: String(body.service?.kind || 'unknown'),
        mode: String(body.service?.kind || 'unknown'),
        acceptedPayloadVersions: versions,
        authConfigured: Boolean(body.authentication?.scheme),
        endpoint: new URL(url).origin,
        limits: body.sync?.limits || {},
        evidenceSections: Array.isArray(body.sync?.evidenceSections) ? body.sync.evidenceSections : [],
        features: body.features || {},
        compatibility: body.compatibility || {},
        schemaVersion: body.schemaVersion,
      }
    }
    if (!response.ok || !body?.ok) return {ok: false, state: 'HTTP_ERROR', httpStatus: response.status, error: 'capability endpoint did not return an OK document'}
    const versions = Array.isArray(body.sync?.accepted_payload_versions)
      ? body.sync.accepted_payload_versions.map(Number).filter(Number.isInteger) : []
    return {
      ok: true,
      state: body.sync?.configured === false ? 'SYNC_NOT_READY' : 'READY',
      service: String(body.service || 'unknown'),
      mode: String(body.mode || 'unknown'),
      acceptedPayloadVersions: versions,
      authConfigured: body.auth?.configured === true,
      endpoint: new URL(url).origin,
      schemaVersion: 'legacy-health',
    }
  } catch (error) { return {ok: false, state: 'UNAVAILABLE', error: error.message} }
}

export async function onlineStatus(graph, args) {
  const result = await discoverEndpointCapabilities({timeoutMs: Math.min(120000, Math.max(1000, Number(args.timeout_ms) || 10000))})
  if (!result.ok) return `Online endpoint ${result.state}: ${result.error}.`
  return `Online endpoint ${result.state}: ${result.service} (${result.mode}) at ${result.endpoint}; payload versions ${result.acceptedPayloadVersions.join(', ') || 'UNKNOWN'}; auth ${result.authConfigured ? 'configured' : 'not configured'}.`
}
