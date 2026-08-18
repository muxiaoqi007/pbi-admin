import type { PbiRefreshable, TenantSnapshot } from './types'

export interface RefreshFailureLike {
  datasetId: string
  datasetName: string
  workspaceName: string
  startTime: string
  refreshType?: string
  error?: string
}

export type WorkspaceHealthState = 'critical' | 'watch' | 'active' | 'healthy' | 'unmonitored'

export interface RefreshHealthItem {
  key: string
  itemId: string
  name: string
  workspaceId?: string
  workspaceName?: string
  status: string
  startTime?: string
  endTime?: string
  durationSeconds?: number
  baselineSeconds?: number
  durationRatio?: number
  modifiedZ?: number
  durationOutlier: boolean
  error?: string
}

export interface WorkspaceHealthItem {
  workspaceId: string
  workspaceName: string
  datasetCount: number
  reportCount: number
  monitoredCount: number
  failedCount: number
  durationOutlierCount: number
  activeCount: number
  state: WorkspaceHealthState
}

export interface OpsHealthModel {
  refreshItems: RefreshHealthItem[]
  actionableItems: RefreshHealthItem[]
  workspaceHealth: WorkspaceHealthItem[]
  failedCount: number
  durationOutlierCount: number
  activeCount: number
  affectedWorkspaceCount: number
  durationModel: {
    sampleSize: number
    ratioMedian?: number
    ratioMad?: number
  }
}

function median(values: number[]): number | undefined {
  if (values.length === 0) return undefined
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) return (sorted[middle - 1] + sorted[middle]) / 2
  return sorted[middle]
}

function parseError(raw?: string): string | undefined {
  if (!raw) return undefined
  try {
    const parsed = JSON.parse(raw) as {
      error?: { message?: string }
      message?: string
    }
    return parsed.error?.message ?? parsed.message ?? raw
  } catch {
    return raw
  }
}

function durationSeconds(start?: string, end?: string, status?: string): number | undefined {
  if (!start) return undefined
  const startMs = Date.parse(start)
  if (!Number.isFinite(startMs)) return undefined
  const endMs = end ? Date.parse(end) : status === 'InProgress' ? Date.now() : Number.NaN
  if (!Number.isFinite(endMs) || endMs < startMs) return undefined
  return Math.round((endMs - startMs) / 1000)
}

function baselineSeconds(refreshable: PbiRefreshable): number | undefined {
  if (typeof refreshable.medianDuration === 'number' && refreshable.medianDuration > 0) {
    return refreshable.medianDuration
  }
  if (typeof refreshable.meanDuration === 'number' && refreshable.meanDuration > 0) {
    return refreshable.meanDuration
  }
  return undefined
}

/**
 * Build a tenant operations-health view from snapshot + Admin refreshables.
 *
 * Duration anomaly detection intentionally avoids a fixed number-of-minutes threshold.
 * Each item's current duration is normalized by its own historical median (or mean fallback),
 * then the tenant-wide ratio distribution uses a robust modified z-score. A value is marked
 * as an outlier only when modified z > 3.5, the conventional robust outlier rule.
 */
export function buildOpsHealth(
  snapshot: TenantSnapshot | undefined,
  refreshables: PbiRefreshable[],
  failures: RefreshFailureLike[] = [],
): OpsHealthModel {
  const datasetById = new Map((snapshot?.datasets ?? []).map((dataset) => [dataset.id, dataset]))
  const failureByDataset = new Map(failures.map((failure) => [failure.datasetId, failure]))

  const refreshItems: RefreshHealthItem[] = refreshables.map((refreshable, index) => {
    const itemId = refreshable.itemId ?? refreshable.id ?? ''
    const dataset = itemId ? datasetById.get(itemId) : undefined
    const failure = itemId ? failureByDataset.get(itemId) : undefined
    const status = refreshable.lastRefresh?.status ?? ''
    const currentDuration = durationSeconds(
      refreshable.lastRefresh?.startTime,
      refreshable.lastRefresh?.endTime,
      status,
    )
    const baseline = baselineSeconds(refreshable)
    const ratio = currentDuration !== undefined && baseline ? currentDuration / baseline : undefined

    return {
      key: itemId || `${refreshable.name ?? 'refreshable'}-${index}`,
      itemId,
      name: refreshable.name || dataset?.name || failure?.datasetName || itemId || '未命名刷新项',
      workspaceId: dataset?.workspaceId,
      workspaceName: dataset?.workspaceName || failure?.workspaceName,
      status,
      startTime: refreshable.lastRefresh?.startTime || failure?.startTime,
      endTime: refreshable.lastRefresh?.endTime,
      durationSeconds: currentDuration,
      baselineSeconds: baseline,
      durationRatio: ratio,
      durationOutlier: false,
      error: parseError(refreshable.lastRefresh?.serviceExceptionJson) || failure?.error,
    }
  })

  const ratios = refreshItems
    .map((item) => item.durationRatio)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0)
  const ratioMedian = median(ratios)
  const ratioMad = ratioMedian === undefined ? undefined : median(ratios.map((value) => Math.abs(value - ratioMedian)))

  for (const item of refreshItems) {
    if (item.durationRatio === undefined || ratioMedian === undefined || !ratioMad || ratioMad <= 0) continue
    const modifiedZ = (0.6745 * (item.durationRatio - ratioMedian)) / ratioMad
    item.modifiedZ = modifiedZ
    item.durationOutlier = modifiedZ > 3.5
  }

  // Member mode has no tenant refreshables. Preserve explicit refresh-failure findings as actionable rows.
  if (refreshItems.length === 0 && failures.length > 0) {
    for (const failure of failures) {
      const dataset = datasetById.get(failure.datasetId)
      refreshItems.push({
        key: failure.datasetId,
        itemId: failure.datasetId,
        name: failure.datasetName,
        workspaceId: dataset?.workspaceId,
        workspaceName: failure.workspaceName || dataset?.workspaceName,
        status: 'Failed',
        startTime: failure.startTime,
        durationOutlier: false,
        error: failure.error,
      })
    }
  }

  const workspaceHealthMap = new Map<string, WorkspaceHealthItem>()
  for (const workspace of snapshot?.workspaces ?? []) {
    workspaceHealthMap.set(workspace.id, {
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      datasetCount: workspace.datasetCount,
      reportCount: workspace.reportCount,
      monitoredCount: 0,
      failedCount: 0,
      durationOutlierCount: 0,
      activeCount: 0,
      state: 'unmonitored',
    })
  }

  for (const item of refreshItems) {
    if (!item.workspaceId) continue
    const workspace = workspaceHealthMap.get(item.workspaceId)
    if (!workspace) continue
    workspace.monitoredCount++
    if (item.status === 'Failed') workspace.failedCount++
    if (item.durationOutlier) workspace.durationOutlierCount++
    if (item.status === 'InProgress' || item.status === 'NotStarted') workspace.activeCount++
  }

  for (const workspace of workspaceHealthMap.values()) {
    if (workspace.failedCount > 0) workspace.state = 'critical'
    else if (workspace.durationOutlierCount > 0) workspace.state = 'watch'
    else if (workspace.activeCount > 0) workspace.state = 'active'
    else if (workspace.monitoredCount > 0) workspace.state = 'healthy'
    else workspace.state = 'unmonitored'
  }

  const actionableItems = refreshItems
    .filter((item) => item.status === 'Failed' || item.durationOutlier)
    .sort((a, b) => {
      const aSeverity = a.status === 'Failed' ? 2 : 1
      const bSeverity = b.status === 'Failed' ? 2 : 1
      if (aSeverity !== bSeverity) return bSeverity - aSeverity
      return (b.modifiedZ ?? b.durationRatio ?? 0) - (a.modifiedZ ?? a.durationRatio ?? 0)
    })

  const workspaceHealth = [...workspaceHealthMap.values()].sort((a, b) => {
    const order: Record<WorkspaceHealthState, number> = {
      critical: 4,
      watch: 3,
      active: 2,
      healthy: 1,
      unmonitored: 0,
    }
    if (order[a.state] !== order[b.state]) return order[b.state] - order[a.state]
    return b.failedCount - a.failedCount || b.durationOutlierCount - a.durationOutlierCount
  })

  return {
    refreshItems,
    actionableItems,
    workspaceHealth,
    failedCount: refreshItems.filter((item) => item.status === 'Failed').length,
    durationOutlierCount: refreshItems.filter((item) => item.durationOutlier).length,
    activeCount: refreshItems.filter((item) => item.status === 'InProgress' || item.status === 'NotStarted').length,
    affectedWorkspaceCount: workspaceHealth.filter((item) => item.state === 'critical' || item.state === 'watch').length,
    durationModel: {
      sampleSize: ratios.length,
      ratioMedian,
      ratioMad,
    },
  }
}
