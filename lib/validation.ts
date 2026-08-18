/** Small input guards shared by API routes. Values are still validated by the
 * downstream Power BI API, but rejecting path/control characters here prevents
 * accidental path injection and turns malformed requests into 400 responses. */
export function isSafeId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 200 && /^[A-Za-z0-9_-]+$/.test(value)
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isSafeText(value: unknown, maxLength = 500): value is string {
  return typeof value === 'string' && value.length <= maxLength && !/[\u0000-\u001f\u007f]/.test(value)
}

function isTrustedPbiHost(host: string): boolean {
  const normalized = host.toLowerCase()
  return (
    normalized === 'api.powerbi.com' ||
    normalized === 'api.powerbi.cn' ||
    normalized === 'login.microsoftonline.com' ||
    normalized === 'login.chinacloudapi.cn' ||
    normalized === 'analysis.windows.net' ||
    normalized.endsWith('.analysis.windows.net') ||
    normalized === 'analysis.chinacloudapi.cn' ||
    normalized.endsWith('.analysis.chinacloudapi.cn')
  )
}

/** Allow HTTPS endpoint overrides without allowing credentials or obvious local targets. */
export function isSafeHttpsUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 500 || !value.trim()) return false
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return false
    const host = url.hostname.toLowerCase()
    return host !== 'localhost' && host !== '127.0.0.1' && host !== '::1' && !host.endsWith('.local')
  } catch {
    return false
  }
}

/** Endpoint overrides are only intended for Microsoft/Power BI service domains. */
export function isSafePbiUrl(value: unknown): value is string {
  return isSafeHttpsUrl(value) && isTrustedPbiHost(new URL(value).hostname)
}

/**
 * Validate an absolute URL before forwarding a Power BI bearer token to it.
 * Redirect targets may legitimately contain query parameters, so this guard is
 * intentionally less strict than endpoint override validation while keeping the
 * host allow-list and HTTPS/credential requirements.
 */
export function isTrustedPbiRequestUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2000 || !value.trim()) return false
  try {
    const url = new URL(value)
    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.hash &&
      isTrustedPbiHost(url.hostname)
    )
  } catch {
    return false
  }
}
