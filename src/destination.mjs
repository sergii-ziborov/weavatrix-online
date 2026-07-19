export function syncDestination(raw) {
  let url
  try { url = new URL(raw) } catch { throw new Error('WEAVATRIX_SYNC_URL is invalid') }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('WEAVATRIX_SYNC_URL must use HTTPS (or HTTP for loopback development)')
  if (url.username || url.password) throw new Error('WEAVATRIX_SYNC_URL must not contain embedded credentials; use WEAVATRIX_SYNC_TOKEN')
  if (url.hash) throw new Error('WEAVATRIX_SYNC_URL must not contain a fragment')
  const loopback = ['localhost', '127.0.0.1', '[::1]', '::1'].includes(url.hostname.toLowerCase())
  if (url.protocol !== 'https:' && !loopback) throw new Error('WEAVATRIX_SYNC_URL must use HTTPS unless the destination is loopback')
  return {url: url.toString(), display: `${url.origin}${url.pathname}${url.search ? ' (query redacted)' : ''}`}
}
