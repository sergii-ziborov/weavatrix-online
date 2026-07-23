import {
  activeRepositoryIdentity, cacheArchitectureContract, toolResult,
} from 'weavatrix/extension/local-services'
import {syncDestination} from '../destination.mjs'

export async function pullArchitectureContract(graph, args, ctx) {
  let identity
  try { identity = activeRepositoryIdentity(ctx) } catch (error) {
    return toolResult(`Online architecture pull: NO_REPOSITORY (${error.message})`, {state: 'NO_REPOSITORY', cacheChanged: false})
  }
  const syncUrl = process.env.WEAVATRIX_SYNC_URL
  const token = process.env.WEAVATRIX_SYNC_TOKEN
  if (!syncUrl || !token) return toolResult(
    'Online architecture pull is NOT_CONFIGURED. Set WEAVATRIX_SYNC_URL and WEAVATRIX_SYNC_TOKEN, or keep .weavatrix/architecture.json locally.',
    {state: 'NOT_CONFIGURED', repositoryId: identity.repositoryId, cacheChanged: false},
  )
  let url
  try {
    const configured = process.env.WEAVATRIX_ARCHITECTURE_URL || new URL('/api/v1/architecture-contract', syncUrl).toString()
    url = syncDestination(configured).url
  } catch (error) {
    return toolResult(`Online architecture pull: UNSAFE_CONFIGURATION (${error.message}).`, {
      state: 'UNSAFE_CONFIGURATION', repositoryId: identity.repositoryId, cacheChanged: false,
    })
  }
  const timeoutMs = Math.min(120000, Math.max(1000, Number(args.timeout_ms) || 30000))
  try {
    const response = await fetch(url, {
      headers: {authorization: `Bearer ${token}`, 'x-weavatrix-repository-id': identity.repositoryId},
      signal: AbortSignal.timeout(timeoutMs),
    })
    const body = await response.json().catch(() => null)
    if (!response.ok) {
      const serverCode = String(body?.error?.code || body?.state || '').toUpperCase()
      const state = response.status === 401 ? 'AUTH_REQUIRED'
        : response.status === 403 ? 'FORBIDDEN'
          : response.status === 404 && ['REPOSITORY_NOT_FOUND', 'NOT_FOUND'].includes(serverCode) ? 'REPOSITORY_NOT_REGISTERED'
            : response.status === 404 ? 'ENDPOINT_NOT_FOUND'
              : response.status === 409 ? 'REPOSITORY_NOT_READY' : 'HTTP_ERROR'
      return toolResult(`Online architecture pull: ${state} (HTTP ${response.status}). The previous local contract cache remains unchanged.`, {
        state, httpStatus: response.status, serverCode: serverCode || null, cacheChanged: false,
      }, {completeness: {status: 'PARTIAL', reason: 'remote contract was not accepted'}})
    }
    if (body?.state === 'NOT_CONFIGURED' || !body?.contract) return toolResult(
      'Online target architecture is NOT_CONFIGURED. Define and save a target in the Architecture editor first.',
      {state: 'NOT_CONFIGURED', repositoryId: identity.repositoryId, cacheChanged: false},
    )
    const stored = cacheArchitectureContract(ctx.graphPath, body.contract)
    return toolResult(
      `Pulled target architecture ${stored.contract.name} (${stored.contract.style}, ${stored.contract.enforcement}) into the local graph cache.`,
      {
        state: 'ACTIVE', status: 'PULLED', repositoryId: identity.repositoryId,
        cacheChanged: true, source: 'extension-cache', contractHash: stored.contract.contractHash,
        contract: {name: stored.contract.name, style: stored.contract.style, enforcement: stored.contract.enforcement},
      },
      {completeness: {status: 'COMPLETE', reason: 'remote contract accepted by Core normalization and stored in the active graph cache'}},
    )
  } catch (error) {
    return toolResult(
      `Online architecture pull failed: ${error.message}; the previous local contract, if any, remains active.`,
      {state: 'PULL_FAILED', repositoryId: identity.repositoryId, cacheChanged: false},
      {completeness: {status: 'PARTIAL', reason: 'remote contract was not accepted'}},
    )
  }
}
