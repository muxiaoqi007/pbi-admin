'use client'

/** SWR fetcher：非 2xx 时抛出后端返回的 error 信息 */
export async function fetcher<T>(url: string): Promise<T> {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), 30_000)
  let res: Response
  try {
    res = await fetch(url, { signal: controller.signal })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('读取表清单超时（30 秒）。可以先手动输入表名，或检查当前连接是否能访问该数据集。')
    }
    throw error
  } finally {
    window.clearTimeout(timer)
  }
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
