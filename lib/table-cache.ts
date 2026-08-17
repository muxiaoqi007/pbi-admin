'use client'

const KEY = 'pbi-admin:table-cache'

export type TableCacheSource = 'api' | 'manual' | 'legacy'
export interface TableCacheSnapshot {
  tables: string[]
  savedAt: number
  source: TableCacheSource
}
type CacheEntry = { api?: TableCacheSnapshot; manual?: TableCacheSnapshot }
type LegacyEntry = { tables?: string[]; savedAt?: number }
type CacheMap = Record<string, CacheEntry | LegacyEntry>

function cacheKey(environmentId: string, datasetId: string): string {
  return environmentId + ':' + datasetId
}

function load(): CacheMap {
  if (typeof window === 'undefined') return {}
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as CacheMap
  } catch {
    return {}
  }
}

function save(map: CacheMap) {
  try {
    localStorage.setItem(KEY, JSON.stringify(map))
  } catch {
    // localStorage unavailable
  }
}

function normalize(entry?: CacheEntry | LegacyEntry): CacheEntry {
  if (!entry) return {}
  const legacy = entry as LegacyEntry
  if (Array.isArray(legacy.tables)) {
    return { manual: { tables: legacy.tables, savedAt: legacy.savedAt ?? 0, source: 'legacy' } }
  }
  return entry as CacheEntry
}

export function getTableCache(environmentId: string, datasetId: string): CacheEntry {
  if (!environmentId || !datasetId) return {}
  return normalize(load()[cacheKey(environmentId, datasetId)])
}

export function getCachedTables(environmentId: string, datasetId: string): string[] {
  const entry = getTableCache(environmentId, datasetId)
  return Array.from(new Set([...(entry.api?.tables ?? []), ...(entry.manual?.tables ?? [])]))
}

export function setCachedTables(
  environmentId: string,
  datasetId: string,
  tables: string[],
  source: 'api' | 'manual' = 'manual',
) {
  if (!environmentId || !datasetId || tables.length === 0) return
  const map = load()
  const key = cacheKey(environmentId, datasetId)
  const entry = normalize(map[key])
  const clean = Array.from(new Set(tables.map((x) => x.trim()).filter(Boolean)))
  entry[source] = { tables: clean, savedAt: Date.now(), source }
  map[key] = entry
  save(map)
}

export function clearCachedTables(environmentId: string, datasetId: string) {
  const map = load()
  delete map[cacheKey(environmentId, datasetId)]
  save(map)
}
