'use client'

function redirectExpiredSession(res: Response) {
  if (res.status !== 401 || window.location.pathname === '/login') return
  const next = `${window.location.pathname}${window.location.search}${window.location.hash}`
  const loginUrl = `/login?next=${encodeURIComponent(next)}`
  window.location.assign(loginUrl)
}

async function readJSON(res: Response): Promise<Record<string, unknown>> {
  return (await res.json().catch(() => ({}))) as Record<string, unknown>
}

function responseError(res: Response, data: Record<string, unknown>) {
  redirectExpiredSession(res)
  if (res.status === 401) return new Error('会话已过期，正在跳转到登录页…')
  return new Error(typeof data.error === 'string' ? data.error : `请求失败 (HTTP ${res.status})`)
}

/** SWR fetcher：非 2xx 时抛出后端返回的 error 信息，并在会话失效时自动回登录页。 */
export async function fetcher<T>(url: string): Promise<T> {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), 30_000)
  let res: Response
  try {
    res = await fetch(url, { signal: controller.signal })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('请求超时（30 秒）。请稍后重试，或检查当前 Power BI 连接与网络状态。')
    }
    throw error
  } finally {
    window.clearTimeout(timer)
  }
  const data = await readJSON(res)
  if (!res.ok) throw responseError(res, data)
  return data as T
}

export async function postJSON<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  })
  const data = await readJSON(res)
  if (!res.ok) throw responseError(res, data)
  return data as T
}
