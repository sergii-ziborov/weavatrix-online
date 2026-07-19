import {createHash} from 'node:crypto'
import {createSourceFreeSyncMaterial, toolResult} from 'weavatrix/extension/local-services'
import {syncDestination} from '../destination.mjs'
import {discoverEndpointCapabilities} from '../endpoint-capabilities.mjs'

const PREVIEW_TTL_MS = 5 * 60 * 1000
const MAX_PREVIEWS = 4
const previews = new Map()

const prune = (now = Date.now()) => {
  for (const [token, preview] of previews) if (preview.expiresAt <= now) previews.delete(token)
  while (previews.size >= MAX_PREVIEWS) previews.delete(previews.keys().next().value)
}

const confirmationToken = (preview) => createHash('sha256')
  .update(`weavatrix-online-sync-v1\0${preview.url}\0${preview.repositoryId}\0${preview.payload.syncPayloadV}\0${preview.bodyHash}`)
  .digest('hex').slice(0, 24)

const sections = (payload) => payload.syncPayloadV !== 3
  ? 'graph topology only (explicit V2 compatibility mode)'
  : Object.entries(payload.evidence?.sections || {}).map(([name, value]) => `${name}:${value?.state || value?.verdict || 'included'}`).join(', ')
    || 'bounded architecture/health/stack/package/duplicate evidence'

const previewText = (preview, {expired = false} = {}) => [
  `SYNC PREVIEW${expired ? ' (the supplied confirmation was missing, expired, or did not match)' : ''} — no network request was made.`,
  `Destination: ${preview.destinationDisplay}.`,
  `Repository: ${preview.repoName}; opaque repository UUID: ${preview.repositoryId}.`,
  `Payload V${preview.payload.syncPayloadV}: ${preview.payload.nodes.length} nodes / ${preview.payload.links.length} edges, ${Math.round(preview.bodyBytes / 1024)} KB; body SHA-256 ${preview.bodyHash.slice(0, 12)}.`,
  `Payload fields: ${Object.keys(preview.payload).sort().join(', ')}.`,
  `Included sections: ${sections(preview.payload)}.`,
  'Excluded by the wire allowlist: source bodies, snippets, absolute host paths, environment values, credentials, Git remotes, and unknown fields.',
  `After approving this exact destination and summary, call sync_graph within 5 minutes with dry_run:false and confirm_token: "${preview.token}".`,
].join('\n')

async function buildPreview(graph, args, ctx) {
  if (!process.env.WEAVATRIX_SYNC_URL) return 'Graph sync is not configured. Set WEAVATRIX_SYNC_URL and, when required, WEAVATRIX_SYNC_TOKEN.'
  let destination
  try { destination = syncDestination(process.env.WEAVATRIX_SYNC_URL) } catch (error) { return `Graph sync is not configured safely: ${error.message}.` }
  let material
  try { material = await createSourceFreeSyncMaterial(graph, {payloadVersion: args.payload_version}, ctx) } catch (error) { return `Cannot sync: ${error.message}` }
  const preview = {
    ...material,
    url: destination.url,
    destinationDisplay: destination.display,
    expiresAt: Date.now() + PREVIEW_TTL_MS,
  }
  preview.token = confirmationToken(preview)
  previews.set(preview.token, preview)
  return preview
}

const previewResult = (preview, options = {}) => typeof preview === 'string' ? preview : toolResult(previewText(preview, options), {
  status: 'PREVIEW_READY', networkRequestMade: false,
  destination: preview.destinationDisplay, repository: preview.repoName,
  repositoryId: preview.repositoryId, payloadVersion: preview.payload.syncPayloadV,
  nodes: preview.payload.nodes.length, links: preview.payload.links.length,
  bodyBytes: preview.bodyBytes, bodyHash: preview.bodyHash,
  payloadFields: Object.keys(preview.payload).sort(), sections: sections(preview.payload),
  expiresAt: new Date(preview.expiresAt).toISOString(), confirmToken: preview.token,
}, {completeness: {status: 'COMPLETE', reason: 'exact allowlisted payload serialized locally; no network request made'}})

export async function previewSync(graph, args, ctx) {
  prune()
  return previewResult(await buildPreview(graph, args, ctx))
}

async function send(preview, timeoutMs) {
  try {
    const capabilities = await discoverEndpointCapabilities({timeoutMs: Math.min(timeoutMs, 10000)})
    if (!capabilities.ok) return `Sync blocked: endpoint capability negotiation is ${capabilities.state} (${capabilities.error}).`
    if (!capabilities.acceptedPayloadVersions.includes(preview.payload.syncPayloadV)) {
      return `Sync blocked: endpoint accepts payload version(s) ${capabilities.acceptedPayloadVersions.join(', ') || 'none'}, not V${preview.payload.syncPayloadV}.`
    }
    const response = await fetch(preview.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-weavatrix-payload-version': String(preview.payload.syncPayloadV),
        'x-weavatrix-repo': preview.repoName,
        'x-weavatrix-repository-id': preview.repositoryId,
        ...(process.env.WEAVATRIX_SYNC_TOKEN ? {authorization: `Bearer ${process.env.WEAVATRIX_SYNC_TOKEN}`} : {}),
      },
      body: preview.body,
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!response.ok) {
      const accepted = response.headers?.get?.('x-weavatrix-accept-payload-versions')
      const compatibility = (response.status === 415 || response.status === 422) && accepted
        ? ` Endpoint accepts payload version(s) ${accepted}; approve a new compatible preview explicitly.` : ''
      return `Sync endpoint ${preview.destinationDisplay} answered HTTP ${response.status} — graph NOT accepted.${compatibility}`
    }
    previews.delete(preview.token)
    return `Graph for ${preview.repoName} (${preview.payload.nodes.length} nodes / ${preview.payload.links.length} edges, ${Math.round(preview.bodyBytes / 1024)} KB) pushed to approved destination ${preview.destinationDisplay}.`
  } catch (error) {
    return `Sync failed: ${error.message} — the graph stays local; the approved preview remains retryable until it expires.`
  }
}

export async function syncGraph(graph, args, ctx) {
  if (args.dry_run !== false) {
    prune()
    const preview = await buildPreview(graph, args, ctx)
    if (typeof preview === 'string') return preview
    return `${previewText(preview)}\nNo network request was made because dry_run is still true.`
  }
  let destination
  try { destination = syncDestination(process.env.WEAVATRIX_SYNC_URL) } catch (error) { return `Graph sync is not configured safely: ${error.message}.` }
  prune()
  const token = String(args.confirm_token || '').trim()
  const approved = token ? previews.get(token) : null
  if (approved && approved.expiresAt > Date.now() && approved.url === destination.url && approved.graphPath === ctx.graphPath) {
    const timeoutMs = Math.min(120000, Math.max(1000, Number(args.timeout_ms) || 30000))
    return send(approved, timeoutMs)
  }
  const preview = await buildPreview(graph, args, ctx)
  return typeof preview === 'string' ? preview : previewText(preview, {expired: true})
}
