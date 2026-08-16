import { getAccessToken } from './auth'
import { resolveRuntime } from './config'
import type {
  DatasetView,
  DatasourceIndex,
  DatasourceIndexItem,
  PbiAdminUser,
  PbiDatasource,
  PbiRefresh,
  PbiRefreshable,
  PbiRefreshSchedule,
  PbiReportPage,
  PbiTable,
  PbiWorkspace,
  PbiWorkspaceUser,
  RefreshType,
  ReportView,
  TenantSnapshot,
  WorkspaceView,
} from './types'

export class PbiError extends Error {
  status: number
  code?: string
  constructor(status: number, message: string, code?: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

/** 统一的 Power BI REST 请求：自动带 token，手动跟随重定向（世纪互联 api.powerbi.cn
 *  会 302 到 wabi-*.analysis.chinacloudapi.cn 区域后端；跨域重定向可能丢弃
 *  Authorization 头，必须重定向后重新携带），401 时刷新 token 重试一次 */
async function pbiRequest(
  path: string,
  init?: RequestInit & { forceToken?: boolean },
): Promise<Response> {
  const { apiBase } = await resolveRuntime()
  const token = await getAccessToken(init?.forceToken)
  let url = path.startsWith('http') ? path : `${apiBase}${path}`
  let res: Response
  for (let hop = 0; ; hop++) {
    res = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
      cache: 'no-store',
      redirect: 'manual',
    })
    const location = res.headers.get('location')
    if ([301, 302, 303, 307, 308].includes(res.status) && location && hop < 5) {
      url = new URL(location, url).toString()
      continue
    }
    break
  }
  // 401/403 且本次非强制刷新 token → 刷新 token 重试一次（Power BI token 过期可能返回 403）
  if ((res.status === 401 || res.status === 403) && !init?.forceToken) {
    return pbiRequest(path, { ...init, forceToken: true })
  }
  return res
}

async function pbiJson<T>(path: string, init?: RequestInit & { forceToken?: boolean }): Promise<T> {
  const res = await pbiRequest(path, init)
  if (!res.ok) {
    throw await toPbiError(res)
  }
  const text = await res.text()
  return text ? (JSON.parse(text) as T) : ({} as T)
}

async function toPbiError(res: Response): Promise<PbiError> {
  const text = await res.text().catch(() => '')
  let message = text || res.statusText
  let code: string | undefined
  try {
    const j = JSON.parse(text)
    message = j.error?.message || j.error?.code || j.message || text
    code = j.error?.code || j.errorCode || undefined
  } catch {
    /* 非 JSON 错误体，保留原文 */
  }
  if (res.status === 403) {
    // 区分 token 过期和真正的权限不足
    if (/expired|access token/i.test(message)) {
      message = `访问令牌已过期 (HTTP 403)。请重试；如反复出现请检查系统时间是否准确。`
    } else {
      message = `无权限 (HTTP 403)：${message}。常见原因：租户设置未允许服务主体使用 Power BI API，或服务主体不在目标工作区内。`
    }
  }
  if (res.status === 401) {
    message = text.trim()
      ? `认证未通过 (HTTP 401)：${message}`
      : '认证未通过 (HTTP 401，服务无详细信息)。世纪互联的管理 API 不支持服务主体，本工具会自动降级为成员模式（仅显示服务主体已加入的工作区）；若应为管理模式，请检查租户设置「允许服务主体使用 Power BI API」。'
  }
  return new PbiError(res.status, message, code)
}

// ---------------------------------------------------------------------------
// 全租户快照：优先管理模式（admin API），世纪互联下自动降级为成员模式（普通 API）
// ---------------------------------------------------------------------------

const SNAPSHOT_TTL_MS = 5 * 60 * 1000
let snapshotCache: { data: TenantSnapshot; at: number } | null = null

/** 当前快照模式：admin = 全租户管理 API；member = 服务主体可见的工作区 */
export function getSnapshotMode(): 'admin' | 'member' {
  return snapshotCache?.data.mode ?? 'admin'
}

function buildSnapshot(
  mode: 'admin' | 'member',
  workspaces: PbiWorkspace[],
  fetchedAt = new Date().toISOString(),
): TenantSnapshot {
  const wsViews: WorkspaceView[] = []
  const reports: ReportView[] = []
  const datasets: DatasetView[] = []
  const reportCountByDataset = new Map<string, number>()

  for (const ws of workspaces) {
    wsViews.push({
      id: ws.id,
      name: ws.name,
      type: ws.type,
      state: ws.state,
      isOnDedicatedCapacity: ws.isOnDedicatedCapacity,
      users: ws.users ?? [],
      reportCount: ws.reports?.length ?? 0,
      datasetCount: ws.datasets?.length ?? 0,
    })
    for (const r of ws.reports ?? []) {
      reports.push({ ...r, workspaceId: ws.id, workspaceName: ws.name })
      if (r.datasetId) {
        reportCountByDataset.set(r.datasetId, (reportCountByDataset.get(r.datasetId) ?? 0) + 1)
      }
    }
    for (const d of ws.datasets ?? []) {
      datasets.push({ ...d, workspaceId: ws.id, workspaceName: ws.name, reportCount: 0 })
    }
  }

  // 同一数据集可能被跨工作区报表引用，快照完整后再统一计算关联报表数
  const datasetViews = datasets.map((d) => ({
    ...d,
    reportCount: reportCountByDataset.get(d.id) ?? 0,
  }))

  return { mode, fetchedAt, workspaces: wsViews, reports, datasets: datasetViews }
}

/** 管理模式：/admin/groups 一次展开（世纪互联不支持服务主体调管理 API，会 401） */
async function scanAsAdmin(): Promise<TenantSnapshot> {
  const PAGE = 5000
  const workspaces: PbiWorkspace[] = []
  for (let skip = 0; ; skip += PAGE) {
    // 用 /admin/groups 而非 /admin/workspaces：世纪互联没有 /admin/workspaces 路由
    const page = await pbiJson<{ value: PbiWorkspace[] }>(
      `/admin/groups?$expand=users,reports,datasets&$top=${PAGE}&$skip=${skip}`,
    )
    workspaces.push(...(page.value ?? []))
    if (!page.value || page.value.length < PAGE) break
  }
  return buildSnapshot('admin', workspaces)
}

/** 成员模式：/groups 拿服务主体可见的工作区，再逐工作区取数据集/报表/成员 */
async function scanAsMember(): Promise<TenantSnapshot> {
  const groupsRes = await pbiJson<{ value: { id: string; name: string; isOnDedicatedCapacity?: boolean }[] }>(
    `/groups?$top=5000`,
  )
  const groups = groupsRes.value ?? []

  const workspaces: PbiWorkspace[] = []
  const CHUNK = 10
  for (let i = 0; i < groups.length; i += CHUNK) {
    const batch = groups.slice(i, i + CHUNK)
    const results = await Promise.allSettled(
      batch.map(async (g) => {
        const [datasets, reports, users] = await Promise.allSettled([
          pbiJson<{ value: PbiWorkspace['datasets'] }>(`/groups/${g.id}/datasets`),
          pbiJson<{ value: PbiWorkspace['reports'] }>(`/groups/${g.id}/reports?$top=5000`),
          pbiJson<{ value: PbiWorkspaceUser[] }>(`/groups/${g.id}/users`),
        ])
        return {
          id: g.id,
          name: g.name,
          isOnDedicatedCapacity: g.isOnDedicatedCapacity,
          datasets: datasets.status === 'fulfilled' ? datasets.value?.value ?? [] : [],
          reports: reports.status === 'fulfilled' ? reports.value?.value ?? [] : [],
          users: users.status === 'fulfilled' ? users.value?.value ?? [] : [],
        } satisfies PbiWorkspace
      }),
    )
    for (const r of results) {
      if (r.status === 'fulfilled') workspaces.push(r.value)
    }
  }
  return buildSnapshot('member', workspaces)
}

export async function getTenantSnapshot(force = false): Promise<TenantSnapshot> {
  if (!force && snapshotCache && Date.now() - snapshotCache.at < SNAPSHOT_TTL_MS) {
    return snapshotCache.data
  }
  let snapshot: TenantSnapshot
  try {
    snapshot = await scanAsAdmin()
  } catch (e) {
    if (e instanceof PbiError && (e.status === 401 || e.status === 403)) {
      // 世纪互联：管理 API 不接受服务主体 → 成员模式降级
      snapshot = await scanAsMember()
    } else {
      throw e
    }
  }
  snapshotCache = { data: snapshot, at: Date.now() }
  return snapshot
}

// ---------------------------------------------------------------------------
// 单项查询（按快照模式选路由，失败时尝试另一条）
// ---------------------------------------------------------------------------

export async function getReportUsers(reportId: string): Promise<PbiAdminUser[]> {
  if (getSnapshotMode() === 'member') {
    throw new PbiError(
      401,
      '成员模式（管理 API 不可用）：世纪互联不支持查询报表级别的单独授权用户，可在报表所在工作区的详情中查看成员列表。租户内开通服务主体管理 API 后自动恢复。',
    )
  }
  const data = await pbiJson<{ value: PbiAdminUser[] }>(`/admin/reports/${reportId}/users`)
  return data.value ?? []
}

/** 数据集权限用户（成员模式可用：/groups/{wid}/datasets/{did}/users） */
export async function getDatasetUsers(workspaceId: string, datasetId: string): Promise<PbiAdminUser[]> {
  const data = await pbiJson<{ value: PbiAdminUser[] }>(
    `/groups/${workspaceId}/datasets/${datasetId}/users`,
  )
  return data.value ?? []
}

/** 报表页面清单（成员模式可用：/groups/{wid}/reports/{rid}/pages） */
export async function getReportPages(workspaceId: string, reportId: string): Promise<PbiReportPage[]> {
  const data = await pbiJson<{ value: PbiReportPage[] }>(
    `/groups/${workspaceId}/reports/${reportId}/pages`,
  )
  return data.value ?? []
}

async function listDatasourcesAdmin(datasetId: string) {
  const data = await pbiJson<{ value: PbiDatasource[] }>(`/admin/datasets/${datasetId}/datasources`)
  return data.value ?? []
}

async function listDatasourcesMember(workspaceId: string, datasetId: string) {
  const data = await pbiJson<{ value: PbiDatasource[] }>(
    `/groups/${workspaceId}/datasets/${datasetId}/datasources`,
  )
  return data.value ?? []
}

export async function getDatasetDatasources(datasetId: string, workspaceId?: string): Promise<PbiDatasource[]> {
  const preferMember = getSnapshotMode() === 'member' && workspaceId
  const primary = () =>
    preferMember ? listDatasourcesMember(workspaceId!, datasetId) : listDatasourcesAdmin(datasetId)
  try {
    return await primary()
  } catch (e) {
    if (e instanceof PbiError && [401, 403, 404].includes(e.status) && workspaceId) {
      const fallback = () =>
        preferMember ? listDatasourcesAdmin(datasetId) : listDatasourcesMember(workspaceId, datasetId)
      try {
        return await fallback()
      } catch {
        throw e
      }
    }
    throw e
  }
}

async function listRefreshesAdmin(workspaceId: string, datasetId: string) {
  const data = await pbiJson<{ value: PbiRefresh[] }>(
    `/admin/groups/${workspaceId}/datasets/${datasetId}/refreshes?$top=50`,
  )
  return data.value ?? []
}

async function listRefreshesMember(workspaceId: string, datasetId: string) {
  const data = await pbiJson<{ value: PbiRefresh[] }>(
    `/groups/${workspaceId}/datasets/${datasetId}/refreshes?$top=50`,
  )
  return data.value ?? []
}

export async function getRefreshHistory(workspaceId: string, datasetId: string): Promise<PbiRefresh[]> {
  const sorted = (list: PbiRefresh[]) => list.sort((a, b) => (a.startTime < b.startTime ? 1 : -1))
  try {
    return sorted(await listRefreshesAdmin(workspaceId, datasetId))
  } catch (e) {
    // 世纪互联没有管理版刷新记录路由（404），回落到普通路由
    if (e instanceof PbiError && [401, 403, 404].includes(e.status)) {
      return sorted(await listRefreshesMember(workspaceId, datasetId))
    }
    throw e
  }
}

/** 数据集的定时刷新计划 */
export async function getRefreshSchedule(workspaceId: string, datasetId: string): Promise<PbiRefreshSchedule> {
  return pbiJson<PbiRefreshSchedule>(`/groups/${workspaceId}/datasets/${datasetId}/refreshSchedule`)
}

/** 数据集表清单（服务主体需在工作区内）：
 *  1) REST /tables —— 仅推送数据集有效，普通语义模型返回 404
 *  2) 回退 executeQueries + DAX 目录查询 INFO.VIEW.TABLES()，适用普通语义模型
 *  注意：executeQueries 要求调用者对该数据集有 Build（重新生成）权限，
 *  工作区成员不够，需要在数据集的「使用权限」里单独给服务主体授权，
 *  否则返回 401 PowerBINotAuthorizedException */
export async function getDatasetTables(workspaceId: string, datasetId: string): Promise<PbiTable[]> {
  try {
    const data = await pbiJson<{ value: PbiTable[] }>(
      `/groups/${workspaceId}/datasets/${datasetId}/tables`,
    )
    if (Array.isArray(data.value)) return data.value
  } catch (e) {
    if (!(e instanceof PbiError) || ![400, 404].includes(e.status)) throw e
  }

  try {
    const data = await pbiJson<{
      results?: { tables?: { rows?: Record<string, unknown>[] }[] }[]
    }>(`/groups/${workspaceId}/datasets/${datasetId}/executeQueries`, {
      method: 'POST',
      body: JSON.stringify({
        queries: [{ query: 'EVALUATE TOPN(500, INFO.VIEW.TABLES())' }],
      }),
    })
    const rows = data.results?.[0]?.tables?.[0]?.rows ?? []
    return rows
      .map((r) => ({
        name: String(r['[Name]'] ?? ''),
        isHidden: Boolean(r['[IsHidden]']),
      }))
      .filter((t) => t.name)
  } catch (e) {
    if (e instanceof PbiError && (e.status === 401 || e.status === 403)) {
      throw new PbiError(
        e.status,
        '无法读取表清单：该数据集未授予服务主体 Build（重新生成）权限。executeQueries 需要"使用 + 重新生成"权限，工作区成员权限不够。请在 Power BI 服务的「数据集 → 权限」或「语义模型 → 使用权限」中给服务主体添加 Build 权限；或先手动输入表名（见下）。',
        e.code,
      )
    }
    throw e
  }
}

export async function getRefreshables(): Promise<PbiRefreshable[]> {
  if (getSnapshotMode() === 'member') {
    throw new PbiError(404, '成员模式下不可用：全租户刷新状态依赖管理 API。')
  }
  const data = await pbiJson<{ value: PbiRefreshable[] }>('/admin/refreshables')
  return data.value ?? []
}

// ---------------------------------------------------------------------------
// 触发刷新
// ---------------------------------------------------------------------------

export interface RefreshRequest {
  workspaceId: string
  datasetId: string
  /** all = 经典全量；allEnhanced = 增强全量（可用处理类型/并行/重试）；tables = 选表增强刷新 */
  mode: 'all' | 'allEnhanced' | 'tables'
  tables?: string[]
  type?: RefreshType
  retryCount?: number
  maxParallelism?: number
  commitMode?: 'transactional' | 'partialBatch'
  /** 增量刷新策略：false = 忽略策略强制完整刷新 */
  applyRefreshPolicy?: boolean
  /** 增量刷新的有效日期（ISO），未填用服务端当前时间 */
  effectiveDate?: string
}

export interface Accepted {
  accepted: boolean
  status: number
  location?: string
}

export async function triggerRefresh(req: RefreshRequest): Promise<Accepted> {
  let body: Record<string, unknown>
  if (req.mode === 'all') {
    body = { notifyOption: 'NoNotification' }
  } else {
    body = {
      type: req.type ?? 'full',
      commitMode: req.commitMode ?? 'transactional',
      maxParallelism: req.maxParallelism ?? 1,
      retryCount: req.retryCount ?? 0,
      notifyOption: 'NoNotification',
    }
    if (req.mode === 'tables') {
      body.objects = (req.tables ?? []).map((t) => ({ table: t }))
    }
    if (req.applyRefreshPolicy !== undefined) {
      body.applyRefreshPolicy = req.applyRefreshPolicy
    }
    if (req.effectiveDate) {
      body.effectiveDate = req.effectiveDate
    }
  }
  const res = await pbiRequest(
    `/groups/${req.workspaceId}/datasets/${req.datasetId}/refreshes`,
    { method: 'POST', body: JSON.stringify(body) },
  )
  if (!res.ok && res.status !== 202) {
    throw await toPbiError(res)
  }
  return { accepted: true, status: res.status, location: res.headers.get('location') ?? undefined }
}

// ---------------------------------------------------------------------------
// 运维：把服务主体加入工作区（解锁触发刷新权限，仅管理模式可用）
// ---------------------------------------------------------------------------

export async function addServicePrincipalToWorkspace(
  workspaceId: string,
  clientId: string,
  role: 'Admin' | 'Member' | 'Contributor',
): Promise<void> {
  if (getSnapshotMode() === 'member') {
    throw new PbiError(
      400,
      '成员模式下不可用：批量加入依赖管理 API。请让各工作区管理员在 Power BI 服务的「工作区访问权限」中手动添加该服务主体（输入客户端 ID），或使用管理员账号加入安全组。',
    )
  }
  await pbiRequest(`/admin/groups/${workspaceId}/users`, {
    method: 'POST',
    body: JSON.stringify({
      identifier: clientId,
      principalType: 'App',
      groupUserAccessRight: role,
    }),
  })
}

// ---------------------------------------------------------------------------
// 数据源视角：按数据源聚合全部数据集（并发扫描，缓存 10 分钟）
// ---------------------------------------------------------------------------

const DS_INDEX_TTL_MS = 10 * 60 * 1000
let dsIndexCache: { at: number; data: DatasourceIndex } | null = null

export async function getDatasourceIndex(force = false): Promise<DatasourceIndex> {
  if (!force && dsIndexCache && Date.now() - dsIndexCache.at < DS_INDEX_TTL_MS) {
    return dsIndexCache.data
  }
  const snap = await getTenantSnapshot(force)
  const map = new Map<string, DatasourceIndexItem>()
  let scanned = 0

  const CONCURRENCY = 8
  for (let i = 0; i < snap.datasets.length; i += CONCURRENCY) {
    await Promise.allSettled(
      snap.datasets.slice(i, i + CONCURRENCY).map(async (d) => {
        let list: PbiDatasource[]
        try {
          list = await getDatasetDatasources(d.id, d.workspaceId)
        } catch {
          return // 个别数据集不可访问时跳过
        }
        scanned++
        for (const s of list) {
          const cd = s.connectionDetails ?? {}
          const primary = cd.server ?? cd.path ?? cd.url ?? s.name ?? '(未知)'
          const secondary = cd.database ?? cd.kind
          const key = `${s.datasourceType}|${primary}|${secondary ?? ''}`
          let item = map.get(key)
          if (!item) {
            item = {
              key,
              type: s.datasourceType,
              primary,
              secondary,
              gatewayId: s.gatewayId,
              datasetCount: 0,
              datasets: [],
            }
            map.set(key, item)
          }
          if (!item.datasets.some((x) => x.id === d.id)) {
            item.datasets.push({
              id: d.id,
              name: d.name,
              workspaceId: d.workspaceId,
              workspaceName: d.workspaceName,
            })
            item.datasetCount++
          }
        }
      }),
    )
  }

  const items = Array.from(map.values()).sort((a, b) => b.datasetCount - a.datasetCount)
  const data: DatasourceIndex = {
    fetchedAt: new Date().toISOString(),
    scanned,
    items,
  }
  dsIndexCache = { at: Date.now(), data }
  return data
}
