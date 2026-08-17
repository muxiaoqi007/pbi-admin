import { getAccessToken, getAccessTokenDiagnostics } from './auth'
import { getDatasetSchemaViaXmla, XmlaError } from './xmla'
import { getActiveEnvironment, resolveRuntime } from './config'
import { tableFromIPC } from 'apache-arrow'
import { compressionRegistry } from 'apache-arrow/ipc/compression/registry'
import { CompressionType } from 'apache-arrow/fb/compression-type'
import { decompress as decompressZstd } from 'fzstd'
import lz4 from 'lz4js'
import { getCatalogOverview, loadCatalogState, loadDatasetTables, saveCatalogState, saveDatasetCatalog, saveDatasetDatasources, saveDatasetTables } from './catalog-store'
import type {
  DatasetSchema,
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
  SchemaColumn,
  SchemaMeasure,
  SchemaTable,
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

// Power BI executeDaxQueries 的 Arrow 流会压缩字典批次。PyArrow 内置了
// LZ4/ZSTD，而 apache-arrow JS 需要由调用方注册 codec。
compressionRegistry.set(CompressionType.ZSTD, {
  decode: (data) => decompressZstd(data),
})
compressionRegistry.set(CompressionType.LZ4_FRAME, {
  decode: (data) => Uint8Array.from(lz4.decompress(data)),
})

/**
 * 世纪互联的 executeDaxQueries 使用 Arrow IPC 返回结果，不能复用
 * executeQueries 的 JSON 解析。这里按官方接口格式执行 DAX，并把 Arrow
 * 行转换成平台统一的表清单。
 */
async function executeDaxTableCatalog(workspaceId: string, datasetId: string): Promise<PbiTable[]> {
  const dax = `
EVALUATE
SELECTCOLUMNS(
  INFO.VIEW.TABLES(),
  "TableName", [Name],
  "IsHidden", [IsHidden]
)
ORDER BY [TableName]`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 30_000)
  let response: Response
  try {
    response = await pbiRequest(
    '/groups/' + workspaceId + '/datasets/' + datasetId + '/executeDaxQueries',
    {
      method: 'POST',
      headers: { Accept: 'application/vnd.apache.arrow.stream' },
      body: JSON.stringify({ query: dax, queryTimeout: 120, resultSetRowCountLimit: 10000 }),
      signal: controller.signal,
    },
    )
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new PbiError(504, 'DAX 表清单查询超时', 'DAX_QUERY_TIMEOUT')
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
  if (!response.ok) throw await toPbiError(response)
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (!bytes.length) return []
  const table = tableFromIPC(bytes)
  const metadata = table.schema.metadata
  if (metadata?.get('IsError') === 'true') {
    throw new PbiError(422, metadata.get('FaultString') ?? 'DAX 查询失败', 'DAX_QUERY_ERROR')
  }
  return table.toArray().map((row) => {
    const value = row as Record<string, unknown>
    const rawName = String(value.TableName ?? value['[TableName]'] ?? value.Name ?? value['[Name]'] ?? '')
    // The China cloud Arrow endpoint can expose UTF-8 bytes as Latin-1 text in
    // apache-arrow JS (for example `日期` becomes `æ—¥æœŸ`). Repair only when
    // the conversion produces CJK text, so ordinary ASCII/Latin names stay intact.
    const repairedName = Buffer.from(rawName, 'latin1').toString('utf8')
    const name = /[\u3400-\u9fff]/u.test(repairedName) ? repairedName : rawName
    const hidden = value.IsHidden ?? value['[IsHidden]']
    return { name, isHidden: hidden === true || hidden === 1 || hidden === 'true' }
  }).filter((row) => row.name)
}

export async function getDatasetName(workspaceId: string, datasetId: string): Promise<string> {
  const detail = await pbiJson<{ name?: string }>('/groups/' + workspaceId + '/datasets/' + datasetId)
  if (!detail.name) throw new PbiError(404, '未找到数据集名称')
  return detail.name
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
let snapshotCache: { envId: string; data: TenantSnapshot; at: number } | null = null

/** 当前激活环境 ID（用于缓存隔离） */
function activeEnvId(): string {
  return getActiveEnvironment()?.id ?? ''
}

/** 当前快照模式：admin = 全租户管理 API；member = 服务主体可见的工作区 */
export function getSnapshotMode(): 'admin' | 'member' {
  return snapshotCache && snapshotCache.envId === activeEnvId()
    ? snapshotCache.data.mode
    : 'admin'
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
  const envId = activeEnvId()
  if (
    !force &&
    snapshotCache &&
    snapshotCache.envId === envId &&
    Date.now() - snapshotCache.at < SNAPSHOT_TTL_MS
  ) {
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
  snapshotCache = { envId, data: snapshot, at: Date.now() }
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
    const list = await primary()
    if (workspaceId) saveDatasetDatasources(activeEnvId(), workspaceId, datasetId, list, new Date().toISOString())
    return list
  } catch (e) {
    if (e instanceof PbiError && [401, 403, 404].includes(e.status) && workspaceId) {
      const fallback = () =>
        preferMember ? listDatasourcesAdmin(datasetId) : listDatasourcesMember(workspaceId, datasetId)
      try {
        const list = await fallback()
        saveDatasetDatasources(activeEnvId(), workspaceId, datasetId, list, new Date().toISOString())
        return list
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
  return (await getDatasetTablesDetailed(workspaceId, datasetId)).tables
}

export interface DatasetTablesResult {
  tables: PbiTable[]
  source: 'rest' | 'schema' | 'dmv' | 'dax' | 'legacy'
  fetchedAt: string
}

export async function getDatasetTablesDetailed(
  workspaceId: string,
  datasetId: string,
  options: { fast?: boolean; force?: boolean } = {},
): Promise<DatasetTablesResult> {
  const fetchedAt = () => new Date().toISOString()
  if (!options.force) {
    const cached = loadDatasetTables(activeEnvId(), workspaceId, datasetId)
    if (cached) return cached as DatasetTablesResult
  }
  let daxError: PbiError | null = null
  try {
    const data = await pbiJson<{ value: PbiTable[] }>('/groups/' + workspaceId + '/datasets/' + datasetId + '/tables')
    if (Array.isArray(data.value)) {
      const result = { tables: data.value, source: 'rest' as const, fetchedAt: fetchedAt() }
      saveDatasetTables({ environmentId: activeEnvId(), workspaceId, datasetId, source: result.source, tables: result.tables, fetchedAt: result.fetchedAt })
      return result
    }
  } catch (e) {
    if (!(e instanceof PbiError) || ![400, 404].includes(e.status)) throw e
  }
  try {
    const tables = await executeDaxTableCatalog(workspaceId, datasetId)
    if (tables.length > 0) {
      const result = { tables, source: 'dax' as const, fetchedAt: fetchedAt() }
      saveDatasetTables({ environmentId: activeEnvId(), workspaceId, datasetId, source: result.source, tables, fetchedAt: result.fetchedAt })
      return result
    }
  } catch (e) {
    if (!(e instanceof PbiError) || ![400, 401, 403, 404, 422, 504].includes(e.status)) throw e
    daxError = e
  }
  // 刷新弹窗只需要快速表清单。不要在 DAX 失败后继续等待耗时的
  // Admin Scanner/XMLA 探测，否则前端会长时间停留在“正在加载”。
  if (options.fast) {
    throw daxError ?? new PbiError(404, '没有获取到数据集表清单')
  }
  try {
    const schema = await getDatasetSchema(workspaceId, datasetId)
    if (schema.tables.length > 0) {
      const result = { tables: schema.tables.map((t) => ({ name: t.name, isHidden: t.isHidden })), source: 'schema' as const, fetchedAt: fetchedAt() }
      saveDatasetTables({ environmentId: activeEnvId(), workspaceId, datasetId, source: result.source, tables: result.tables, fetchedAt: result.fetchedAt })
      return result
    }
  } catch { /* continue to XMLA */ }
  try {
    const snapshot = await getTenantSnapshot(false)
    const dataset = snapshot.datasets.find((item) => item.id === datasetId && item.workspaceId === workspaceId)
    let datasetName = dataset?.name
    if (!datasetName) {
      const detail = await pbiJson<{ name?: string }>('/groups/' + workspaceId + '/datasets/' + datasetId)
      datasetName = detail.name
    }
    if (!datasetName) throw new XmlaError('未找到数据集名称，无法构造 XMLA Catalog', 404)
    const schema = await getDatasetSchemaViaXmla(workspaceId, datasetName)
    const result = { tables: schema.tables.map((t) => ({ name: t.name, isHidden: t.isHidden })), source: 'dmv' as const, fetchedAt: fetchedAt() }
    if (result.tables.length) saveDatasetTables({ environmentId: activeEnvId(), workspaceId, datasetId, source: result.source, tables: result.tables, fetchedAt: result.fetchedAt })
    return result
  } catch (e) {
    throw new PbiError(e instanceof XmlaError ? e.status : 422, e instanceof Error ? e.message : String(e))
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
): Promise<{ status: 'added' | 'unchanged' }> {
  if (getSnapshotMode() === 'member') {
    throw new PbiError(
      400,
      '成员模式下不可用：批量加入依赖管理 API。请让各工作区管理员在 Power BI 服务的「工作区访问权限」中手动添加该服务主体（输入客户端 ID），或使用管理员账号加入安全组。',
    )
  }
  const res = await pbiRequest(`/admin/groups/${workspaceId}/users`, {
    method: 'POST',
    body: JSON.stringify({
      identifier: clientId,
      principalType: 'App',
      groupUserAccessRight: role,
    }),
  })
  if (!res.ok && res.status !== 409) throw await toPbiError(res)
  return { status: res.status === 409 ? 'unchanged' : 'added' }
}

// ---------------------------------------------------------------------------
// 工作区 Schema 扫描（getInfo）：完整表/列/度量值结构，工作区级缓存 30 分钟
// ---------------------------------------------------------------------------

const SCHEMA_TTL_MS = 30 * 60 * 1000
const schemaCache = new Map<string, { envId: string; at: number; datasets: Map<string, DatasetSchema> }>()

interface ScanResultWorkspace {
  id?: string
  name?: string
  datasets?: {
    id: string
    name?: string
    tables?: {
      name: string
      isHidden?: boolean
      columns?: SchemaColumn[]
      measures?: SchemaMeasure[]
    }[]
  }[]
}

function parseSchemaFromScan(result: { workspaces?: ScanResultWorkspace[] }) {
  const byWorkspace = new Map<string, Map<string, DatasetSchema>>()
  for (const ws of result.workspaces ?? []) {
    if (!ws?.id) continue
    const datasets = new Map<string, DatasetSchema>()
    for (const ds of ws.datasets ?? []) {
      const tables: SchemaTable[] = (ds.tables ?? []).map((t) => ({
        name: t.name,
        isHidden: t.isHidden,
        columns: t.columns ?? [],
        measures: t.measures ?? [],
      }))
      datasets.set(ds.id, {
        tables,
        expressions: [],
        measureCount: tables.reduce((n, t) => n + (t.measures?.length ?? 0), 0),
        columnCount: tables.reduce((n, t) => n + (t.columns?.length ?? 0), 0),
      })
    }
    byWorkspace.set(ws.id, datasets)
  }
  return byWorkspace
}

/** 提交 getInfo 扫描并轮询到完成，返回解析后的工作区→数据集 Schema 映射 */
export async function scanWorkspacesSchemas(workspaceIds: string[]): Promise<Map<string, Map<string, DatasetSchema>>> {
  const res = await pbiRequest(
    `/admin/workspaces/getInfo?lineage=True&datasourceDetails=True&datasetSchema=True&datasetExpressions=True`,
    { method: 'POST', body: JSON.stringify({ workspaces: workspaceIds.slice(0, 100) }) },
  )
  if (res.status !== 202) {
    if (res.status === 401 || res.status === 403) {
      throw new PbiError(
        res.status,
        'Schema 扫描（getInfo）无权限。此接口要求应用注册具有 WorkspaceInfo.ReadWrite.All 等应用程序权限并已授予管理员同意（国际版还要求租户设置允许服务主体使用 Fabric API）。',
      )
    }
    throw await toPbiError(res)
  }
  const { id: scanId } = (await res.json()) as { id: string }
  if (!scanId) throw new PbiError(500, '扫描提交成功但未返回 scanId')

  // 轮询（最多 45 秒，每 3 秒一次）
  for (let i = 0; i < 15; i++) {
    await new Promise((r) => setTimeout(r, 3000))
    const stRes = await pbiRequest(`/admin/workspaces/scanStatus/${scanId}`)
    if (!stRes.ok) continue
    const st = (await stRes.json()) as { status?: string }
    if (st.status === 'Failed') throw new PbiError(500, '工作区扫描失败（服务端返回 Failed）')
    if (st.status === 'Succeeded') {
      const resultRes = await pbiRequest(`/admin/workspaces/scanResult/${scanId}`)
      if (!resultRes.ok) throw await toPbiError(resultRes)
      return parseSchemaFromScan(await resultRes.json())
    }
  }
  throw new PbiError(504, '工作区扫描超时（45 秒）')
}

/** 确保某工作区的 Schema 已缓存（未缓存则触发扫描） */
export async function ensureWorkspaceSchema(workspaceId: string): Promise<Map<string, DatasetSchema>> {
  const hit = schemaCache.get(workspaceId)
  if (hit && hit.envId === activeEnvId() && Date.now() - hit.at < SCHEMA_TTL_MS) return hit.datasets
  const byWorkspace = await scanWorkspacesSchemas([workspaceId])
  const datasets = byWorkspace.get(workspaceId) ?? new Map<string, DatasetSchema>()
  schemaCache.set(workspaceId, { envId: activeEnvId(), at: Date.now(), datasets })
  return datasets
}

/** 获取单个数据集的完整 Schema（表/列/度量值），未缓存时扫描整个工作区 */
export async function getDatasetSchema(workspaceId: string, datasetId: string): Promise<DatasetSchema> {
  const datasets = await ensureWorkspaceSchema(workspaceId)
  const schema = datasets.get(datasetId)
  if (!schema) {
    throw new PbiError(404, `扫描结果中未找到该数据集的 Schema（数据集可能不支持 Schema 提取，或为推送/流式数据集）`)
  }
  return schema
}

// ---------------------------------------------------------------------------
// 数据源视角：按数据源聚合全部数据集，结果持久化到统一目录数据库。
// ---------------------------------------------------------------------------

export async function getDatasourceIndex(force = false): Promise<DatasourceIndex> {
  const stored = loadCatalogState<DatasourceIndex>(activeEnvId(), 'datasource-index')
  if (!force && stored) {
    const catalog = getCatalogOverview(activeEnvId()).datasets as Array<Record<string, unknown>>
    return {
      ...stored.value,
      models: catalog.map((r) => ({ workspaceId: String(r.workspace_id), workspaceName: String(r.workspace_name ?? ''), datasetId: String(r.dataset_id), datasetName: String(r.dataset_name ?? ''), tableCount: Number(r.table_count ?? 0), tableSource: r.table_source ? String(r.table_source) : undefined, updatedAt: String(r.updated_at) })),
    }
  }
  const snap = await getTenantSnapshot(force)
  saveDatasetCatalog(activeEnvId(), snap.datasets, snap.fetchedAt)
  const map = new Map<string, DatasourceIndexItem>()
  let scanned = 0
  const errors: DatasourceIndex['errors'] = []

  const CONCURRENCY = 8
  for (let i = 0; i < snap.datasets.length; i += CONCURRENCY) {
    await Promise.allSettled(
      snap.datasets.slice(i, i + CONCURRENCY).map(async (d) => {
        let list: PbiDatasource[]
        try {
          list = await getDatasetDatasources(d.id, d.workspaceId)
        } catch (error) {
          errors.push({ datasetId: d.id, datasetName: d.name, workspaceName: d.workspaceName, message: error instanceof Error ? error.message : String(error) })
          return
        }
        scanned++
        saveDatasetDatasources(activeEnvId(), d.workspaceId, d.id, list, new Date().toISOString())
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
  const catalog = getCatalogOverview(activeEnvId()).datasets as Array<Record<string, unknown>>
  const data: DatasourceIndex = {
    fetchedAt: new Date().toISOString(),
    attempted: snap.datasets.length,
    scanned,
    failed: errors.length,
    errors: errors.slice(0, 100),
    models: catalog.map((r) => ({ workspaceId: String(r.workspace_id), workspaceName: String(r.workspace_name ?? ''), datasetId: String(r.dataset_id), datasetName: String(r.dataset_name ?? ''), tableCount: Number(r.table_count ?? 0), tableSource: r.table_source ? String(r.table_source) : undefined, updatedAt: String(r.updated_at) })),
    items,
  }
  saveCatalogState(activeEnvId(), 'datasource-index', data)
  return data
}

// ---------------------------------------------------------------------------
// 刷新失败巡检：扫描可刷新数据集的最近记录，汇总失败项（成员模式可用）
// ---------------------------------------------------------------------------

export interface RefreshFailureItem {
  datasetId: string
  datasetName: string
  workspaceName: string
  workspaceId: string
  startTime: string
  endTime?: string
  refreshType?: string
  error?: string
}

const FAILURES_TTL_MS = 10 * 60 * 1000
let failuresCache: { envId: string; at: number; data: RefreshFailureItem[] } | null = null

/** 解析 serviceExceptionJson：兼容 {errorCode, errorDescription} 和 {error:{message}} 两种格式 */
function briefRefreshError(raw?: string): string {
  if (!raw) return ''
  try {
    const j = JSON.parse(raw)
    if (j.errorCode || j.errorDescription) {
      return [j.errorCode, j.errorDescription].filter(Boolean).join('：')
    }
    return j.error?.message ?? j.message ?? raw
  } catch {
    return raw
  }
}

export async function getRefreshFailures(force = false): Promise<RefreshFailureItem[]> {
  if (
    !force &&
    failuresCache &&
    failuresCache.envId === activeEnvId() &&
    Date.now() - failuresCache.at < FAILURES_TTL_MS
  ) {
    return failuresCache.data
  }
  const snap = await getTenantSnapshot(force)
  const targets = snap.datasets.filter((d) => d.isRefreshable)
  const failures: RefreshFailureItem[] = []

  const CONCURRENCY = 8
  for (let i = 0; i < targets.length; i += CONCURRENCY) {
    await Promise.allSettled(
      targets.slice(i, i + CONCURRENCY).map(async (d) => {
        try {
          const history = await getRefreshHistory(d.workspaceId, d.id)
          // 只看最近一次结果（跳过进行中的，取最近一条已完结的）
          const last = history.find((r) => r.status !== 'InProgress' && r.status !== 'NotStarted')
          if (last?.status === 'Failed') {
            failures.push({
              datasetId: d.id,
              datasetName: d.name,
              workspaceName: d.workspaceName,
              workspaceId: d.workspaceId,
              startTime: last.startTime,
              endTime: last.endTime,
              refreshType: last.refreshType,
              error: briefRefreshError(last.serviceExceptionJson),
            })
          }
        } catch {
          /* 个别数据集刷新历史不可访问时跳过 */
        }
      }),
    )
  }

  failures.sort((a, b) => (a.startTime < b.startTime ? 1 : -1))
  failuresCache = { envId: activeEnvId(), at: Date.now(), data: failures }
  return failures
}

export async function getConnectionDiagnostics(force = false) {
  const token = await getAccessTokenDiagnostics(force)
  const endpoints = await Promise.all(['/groups?$top=1', '/admin/groups?$top=1'].map(async (path) => {
    try { const response = await pbiRequest(path, { forceToken: force }); return { path, status: response.status, ok: response.ok, requestId: response.headers.get('requestId') ?? undefined } }
    catch (e) { return { path, status: null, ok: false, detail: e instanceof Error ? e.message : String(e) } }
  }))
  return { token, endpoints }
}

export function invalidateSchemaCache() { schemaCache.clear() }
export function invalidatePbiCaches() { snapshotCache = null; failuresCache = null; schemaCache.clear() }

