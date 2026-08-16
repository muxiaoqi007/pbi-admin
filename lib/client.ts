'use client'

/** SWR fetcher：非 2xx 时抛出后端返回的 error 信息 */
export async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url)
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    throw new Error(typeof data.error === 'string' ? data.error : `请求失败 (HTTP ${res.status})`)
  }
  return data as T
}

export async function postJSON<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  })
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    throw new Error(typeof data.error === 'string' ? data.error : `请求失败 (HTTP ${res.status})`)
  }
  return data as T
}
