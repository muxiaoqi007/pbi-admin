'use client'

import useSWR from 'swr'
import { fetcher } from '@/lib/client'
import type { TenantSnapshot } from '@/lib/types'

/** 全站共享的租户快照请求：同一 SWR key 自动去重，避免每页重复实现加载/错误状态。 */
export function useSnapshot(enabled = true) {
  return useSWR<TenantSnapshot>(enabled ? '/api/snapshot' : null, fetcher, {
    keepPreviousData: true,
  })
}
