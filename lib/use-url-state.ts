'use client'

import { useCallback, useEffect, useState } from 'react'

/**
 * 轻量 URL 查询状态：默认值不写入 URL，用户修改后用 replaceState 同步。
 * 监听 popstate，浏览器后退/前进时恢复筛选与分页。
 * defaults 必须是模块级稳定对象，避免 effect 反复重绑。
 */
export function useUrlState<T extends Record<string, string>>(defaults: T) {
  const [values, setValuesState] = useState<T>(defaults)

  const read = useCallback(() => {
    if (typeof window === 'undefined') return defaults
    const params = new URLSearchParams(window.location.search)
    const next: Record<string, string> = { ...defaults }
    for (const key of Object.keys(defaults)) {
      const value = params.get(key)
      if (value !== null) next[key] = value
    }
    return next as T
  }, [defaults])

  useEffect(() => {
    setValuesState(read())
    const onPopState = () => setValuesState(read())
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [read])

  const setValues = useCallback(
    (patch: Partial<T>, options?: { replace?: boolean }) => {
      const next = { ...values, ...patch }
      const params = new URLSearchParams(window.location.search)
      for (const key of Object.keys(defaults)) {
        const value = next[key]
        if (!value || value === defaults[key]) params.delete(key)
        else params.set(key, value)
      }
      const query = params.toString()
      const url = `${window.location.pathname}${query ? `?${query}` : ''}`
      if (options?.replace === false) window.history.pushState(null, '', url)
      else window.history.replaceState(null, '', url)
      setValuesState(next)
    },
    [defaults, values],
  )

  return { values, setValues }
}
