import { NextRequest, NextResponse } from 'next/server'
import { fail } from '@/lib/api'
import { getTenantSnapshot } from '@/lib/pbi'
import { getActiveEnvironment } from '@/lib/config'
import { getAccessToken } from '@/lib/auth'

export const dynamic = 'force-dynamic'

const TTL_MS = 15 * 60 * 1000
let cache: { envId: string; at: number; data: unknown } | null = null

/** 使用分析：活动事件 API（管理模式可用）+ 基于快照的活跃度指标（成员模式降级） */
export async function GET(req: NextRequest) {
  try {
    const days = Math.min(30, Math.max(1, Number(req.nextUrl.searchParams.get('days') ?? 7)))
    const envId = getActiveEnvironment()?.id ?? ''
    if (cache && cache.envId === envId && Date.now() - cache.at < TTL_MS) {
      return NextResponse.json(cache.data)
    }

    const snap = await getTenantSnapshot(false)
    const cutoff = Date.now() - days * 24 * 3600 * 1000

    const recentReports = snap.reports
      .filter((r) => r.modifiedDateTime && Date.parse(r.modifiedDateTime) >= cutoff)
      .sort((a, b) => (a.modifiedDateTime! < b.modifiedDateTime! ? 1 : -1))
      .slice(0, 50)
      .map((r) => ({ id: r.id, name: r.name, workspaceName: r.workspaceName, modifiedDateTime: r.modifiedDateTime, modifiedBy: r.modifiedBy, webUrl: r.webUrl }))

    const recentDatasets = snap.datasets
      .filter((d) => d.modifiedDate && Date.parse(d.modifiedDate) >= cutoff)
      .sort((a, b) => (a.modifiedDate! < b.modifiedDate! ? 1 : -1))
      .slice(0, 50)
      .map((d) => ({ id: d.id, name: d.name, workspaceName: d.workspaceName, modifiedDate: d.modifiedDate, configuredBy: d.configuredBy }))

    // 活动事件 API（需要管理 API 权限；世纪互联服务主体会被 401 拒绝）
    let activityEvents: Record<string, unknown>[] | null = null
    let activityError: string | null = null
    try {
      activityEvents = await fetchActivityEvents(days)
      if (activityEvents.length === 0) activityError = '活动事件 API 返回空（可能无权限或期间无活动）'
    } catch (e) {
      activityError = e instanceof Error ? e.message : String(e)
    }

    // 活跃工作区排行（按最近修改的内容数）
    const workspaceActivity = snap.workspaces
      .map((w) => ({
        id: w.id,
        name: w.name,
        recentReports: recentReports.filter((r) => r.workspaceName === w.name).length,
        recentDatasets: recentDatasets.filter((d) => d.workspaceName === w.name).length,
        totalReports: w.reportCount,
        totalDatasets: w.datasetCount,
        memberCount: w.users.length,
      }))
      .sort((a, b) => b.recentReports + b.recentDatasets - (a.recentReports + a.recentDatasets))
      .slice(0, 20)

    const data = {
      fetchedAt: new Date().toISOString(),
      days,
      recentReports,
      recentDatasets,
      workspaceActivity,
      activityEvents,
      activityError,
      stats: {
        reportCount: snap.reports.length,
        datasetCount: snap.datasets.length,
        recentReportCount: recentReports.length,
        recentDatasetCount: recentDatasets.length,
      },
    }
    cache = { envId, at: Date.now(), data }
    return NextResponse.json(data)
  } catch (e) {
    return fail(e)
  }
}

/** 拉取活动事件（API 约束：start/end 必须在同一 UTC 日期内，逐天拉取，最多 5 天） */
async function fetchActivityEvents(days: number): Promise<Record<string, unknown>[]> {
  const token = await getAccessToken()
  const events: Record<string, unknown>[] = []
  const now = Date.now()
  for (let d = 0; d < Math.min(days, 5); d++) {
    const day = new Date(now - d * 24 * 3600 * 1000)
    const y = day.getUTCFullYear()
    const m = String(day.getUTCMonth() + 1).padStart(2, '0')
    const dd = String(day.getUTCDate()).padStart(2, '0')
    const startISO = `${y}-${m}-${dd}T00:00:00Z`
    const endISO = `${y}-${m}-${dd}T23:59:59Z`
    const path = `/admin/activityevents?startDateTime='${startISO}'&endDateTime='${endISO}'`
    try {
      let j = await fetchJson(path, token)
      events.push(...(j.activityEventEntities ?? []))
      let guard = 0
      while (j.continuationUri && j.continuationToken && guard < 10) {
        const res = await fetch(j.continuationUri, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
        if (!res.ok) break
        j = (await res.json()) as { activityEventEntities?: Record<string, unknown>[]; continuationUri?: string; continuationToken?: string }
        events.push(...(j.activityEventEntities ?? []))
        guard++
      }
    } catch {
      // 该天无数据或权限不足，跳过
    }
  }
  return events
}

async function fetchJson(path: string, token: string): Promise<{ activityEventEntities?: Record<string, unknown>[]; continuationUri?: string; continuationToken?: string }> {
  const { resolveRuntime } = await import('@/lib/config')
  const cfg = await resolveRuntime()
  const res = await fetch(`${cfg.apiBase}${path}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return (await res.json()) as { activityEventEntities?: Record<string, unknown>[]; continuationUri?: string; continuationToken?: string }
}
