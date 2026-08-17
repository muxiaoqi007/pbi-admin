'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import useSWR from 'swr'
import { fetcher } from './client'
import { clearCachedTables, getTableCache, setCachedTables } from './table-cache'
import type { PbiTable } from './types'

export interface CatalogTable extends PbiTable {
  catalogSource: 'rest' | 'schema' | 'dmv' | 'dax' | 'api-cache' | 'manual' | 'legacy'
  cachedAt?: number
}

type ApiResponse = { tables: PbiTable[]; source: 'rest' | 'schema' | 'dmv' | 'dax' | 'legacy'; fetchedAt: string }

export function useDatasetTables(workspaceId?: string, datasetId?: string, enabled = true) {
  const { data: configData } = useSWR<{ activeEnvId?: string }>('/api/config', fetcher)
  const environmentId = configData?.activeEnvId ?? ''
  const [cacheRevision, setCacheRevision] = useState(0)
  const persistedSignature = useRef('')
  const migratedSignature = useRef('')
  const key = enabled && workspaceId && datasetId
    ? `/api/datasets/tables?wid=${workspaceId}&did=${datasetId}`
    : null
  const swr = useSWR<ApiResponse>(key, fetcher, {
    // 表清单接口失败时不要无限重试，避免刷新弹窗永久显示“正在加载”。
    shouldRetryOnError: false,
    revalidateOnFocus: false,
  })

  useEffect(() => {
    if (environmentId && datasetId && swr.data?.tables.length) {
      const names = swr.data.tables.map((table) => table.name)
      const signature = `${environmentId}:${datasetId}:${names.join('\u0000')}`
      if (persistedSignature.current === signature) return
      persistedSignature.current = signature
      setCachedTables(environmentId, datasetId, names, 'api')
      setCacheRevision((value) => value + 1)
    }
  }, [datasetId, environmentId, swr.data])

  // cacheRevision intentionally forces a render after localStorage changes.
  void cacheRevision
  const cache = getTableCache(environmentId, datasetId ?? '')

  useEffect(() => {
    if (!workspaceId || !datasetId || !cache.api?.tables.length) return
    const signature = workspaceId + ':' + datasetId + ':' + cache.api.tables.join('\u0000')
    if (migratedSignature.current === signature) return
    migratedSignature.current = signature
    fetch('/api/datasets/tables', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId, datasetId, tables: cache.api.tables, fetchedAt: new Date(cache.api.savedAt).toISOString() }),
    }).catch(() => { migratedSignature.current = '' })
  }, [cache.api, datasetId, workspaceId])

  const tables = useMemo<CatalogTable[]>(() => {
    const result = new Map<string, CatalogTable>()
    for (const table of swr.data?.tables ?? []) result.set(table.name, { ...table, catalogSource: swr.data?.source ?? 'rest' })
    for (const name of cache.api?.tables ?? []) {
      if (!result.has(name)) result.set(name, { name, catalogSource: 'api-cache', cachedAt: cache.api?.savedAt })
    }
    for (const name of cache.manual?.tables ?? []) {
      if (!result.has(name)) {
        result.set(name, {
          name,
          catalogSource: cache.manual?.source === 'legacy' ? 'legacy' : 'manual',
          cachedAt: cache.manual?.savedAt,
        })
      }
    }
    return Array.from(result.values())
  }, [cache, swr.data])

  const addManualTables = useCallback((names: string[]) => {
    if (!environmentId || !datasetId) return
    const existing = getTableCache(environmentId, datasetId).manual?.tables ?? []
    setCachedTables(environmentId, datasetId, [...existing, ...names], 'manual')
    setCacheRevision((value) => value + 1)
  }, [datasetId, environmentId])

  const clearCache = useCallback(() => {
    if (!environmentId || !datasetId) return
    clearCachedTables(environmentId, datasetId)
    setCacheRevision((value) => value + 1)
  }, [datasetId, environmentId])

  return { ...swr, tables, environmentId, addManualTables, clearCache }
}

