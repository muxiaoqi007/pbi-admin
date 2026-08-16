'use client'

const KEY = 'pbi-admin:table-cache'

/** 缓存结构：datasetId → { tables: string[], savedAt: number } */
type CacheMap = Record<string, { tables: string[]; savedAt: number }>

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
    /* localStorage 不可用时静默忽略 */
  }
}

/** 读取某个数据集缓存的表名（不限时效，手动保存的表名长期有效） */
export function getCachedTables(datasetId: string): string[] {
  return load()[datasetId]?.tables ?? []
}

/** 保存某个数据集的表名缓存（API 拿到表清单时自动调用，手动输入时也调用） */
export function setCachedTables(datasetId: string, tables: string[]) {
  if (!datasetId || tables.length === 0) return
  const map = load()
  map[datasetId] = { tables, savedAt: Date.now() }
  save(map)
}

/** 清除某个数据集的表名缓存 */
export function clearCachedTables(datasetId: string) {
  const map = load()
  delete map[datasetId]
  save(map)
}
