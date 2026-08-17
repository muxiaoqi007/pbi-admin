// Power BI REST API 实体类型（仅声明本工具用到的字段，其余字段一律可选）

export type CloudEnv = 'global' | 'china'

/** 认证方式：servicePrincipal = 客户端密钥；password = 账号密码（ROPC） */
export type AuthType = 'servicePrincipal' | 'password'

/** 认证地址 / API 地址 / resource 都已解析完毕的运行时配置（来自激活的租户环境） */
export interface RuntimeConfig {
  envId: string
  envName: string
  cloud: CloudEnv
  authType: AuthType
  tenantId: string
  clientId: string
  clientSecret: string
  username?: string
  password?: string
  authority: string
  apiBase: string
  resource: string
  /** Optional XMLA transport endpoint override (server-side only). */
  xmlaEndpointOverride?: string
}

export interface PbiWorkspaceUser {
  displayName?: string
  email?: string
  identifier: string
  principalType?: string // User | Group | App(服务主体) ...
  groupUserAccessRight?: string // Admin | Member | Contributor | Viewer
}

export interface PbiReport {
  id: string
  name: string
  webUrl?: string
  datasetId?: string
  datasetWorkspaceId?: string
  reportType?: string
  createdDateTime?: string
  modifiedDateTime?: string
  modifiedBy?: string
  users?: PbiAdminUser[]
}

export interface PbiDataset {
  id: string
  name: string
  webUrl?: string
  configuredBy?: string
  isRefreshable?: boolean
  isOnPremGatewayRequired?: boolean
  targetStorageMode?: string
  createdDate?: string
  modifiedDate?: string
  users?: PbiAdminUser[]
}

export interface PbiAdminUser {
  displayName?: string
  email?: string
  identifier: string
  principalType?: string
  groupUserAccessRight?: string
  reportUserAccessRight?: string
  datasetUserAccessRight?: string
  dashboardUserAccessRight?: string
}

export interface PbiWorkspace {
  id: string
  name: string
  type?: string // Workspace | Personal | AdminWorkspace
  state?: string
  isOnDedicatedCapacity?: boolean
  capacityId?: string
  users?: PbiWorkspaceUser[]
  reports?: PbiReport[]
  datasets?: PbiDataset[]
}

export interface PbiDatasource {
  datasourceType: string
  name?: string
  connectionString?: string
  connectionDetails?: {
    server?: string
    database?: string
    url?: string
    path?: string
    kind?: string
    [k: string]: string | undefined
  }
  gatewayId?: string
  datasourceId?: string
}

/** 连接详情的中文标签，未列出的键原样显示 */
export const CONNECTION_LABELS: Record<string, string> = {
  server: '服务器',
  database: '数据库',
  path: '路径',
  url: '网址',
  kind: '连接器',
  class: '类别',
}

/** 数据源类型中文标签（数据源弹窗与数据源视角共用） */
export const DATASOURCE_TYPE_LABELS: Record<string, string> = {
  File: '文件',
  Folder: '文件夹',
  Sql: 'SQL 数据库',
  MySql: 'MySQL',
  AnalysisServices: '分析服务',
  Web: 'Web',
  Extension: '扩展连接器',
  OData: 'OData',
  SharePoint: 'SharePoint',
  Exchange: 'Exchange',
  Oracle: 'Oracle',
  PostgreSql: 'PostgreSQL',
  Db2: 'DB2',
  Teradata: 'Teradata',
  SapHana: 'SAP HANA',
}

/** 数据源视角：一条聚合后的数据源及其关联的数据集 */
export interface DatasourceIndexItem {
  key: string
  type: string
  /** 服务器 / 路径 / 网址 */
  primary: string
  /** 数据库 / 连接器 */
  secondary?: string
  gatewayId?: string
  datasetCount: number
  datasets: { id: string; name: string; workspaceId: string; workspaceName: string }[]
}

export interface DatasourceIndex {
  fetchedAt: string
  attempted: number
  /** 成功扫描的数据集数（失败的不计入） */
  scanned: number
  failed: number
  errors: { datasetId: string; datasetName: string; workspaceName: string; message: string }[]
  models: { workspaceId: string; workspaceName: string; datasetId: string; datasetName: string; tableCount: number; tableSource?: string; updatedAt: string }[]
  items: DatasourceIndexItem[]
}

/** 增强刷新支持的处理类型（TMSL refresh type），客户端与服务端共用 */
export const REFRESH_TYPES = [
  'full',
  'automatic',
  'dataOnly',
  'calculate',
  'clearValues',
  'defragment',
] as const
export type RefreshType = (typeof REFRESH_TYPES)[number]

export interface PbiRefresh {
  id: string
  refreshType?: string
  startTime: string
  endTime?: string
  status?: string // NotStarted | InProgress | Unknown | Completed | Failed
  serviceExceptionJson?: string
  requestSentOn?: string
}

/** 数据集刷新计划（定时刷新配置） */
export interface PbiRefreshSchedule {
  days?: string[]
  times?: string[]
  enabled?: boolean
  localTimeZoneId?: string
  notifyOption?: string
}

export interface PbiTable {
  name: string
  isHidden?: boolean
  description?: string
}

export interface PbiRefreshable {
  id?: string
  capacityId?: string
  itemId?: string
  name?: string
  kind?: string
  startTime?: string
  endTime?: string
  refreshCount?: number
  meanDuration?: number
  medianDuration?: number
  lastRefresh?: {
    startTime?: string
    endTime?: string
    status?: string
    refreshType?: string
    serviceExceptionJson?: string
  }
}

/** 报表页面 */
export interface PbiReportPage {
  name?: string
  displayName?: string
  order?: number
}

/** getInfo 扫描返回的数据集 Schema 结构 */
export interface SchemaColumn {
  name: string
  dataType?: string
}

export interface SchemaMeasure {
  name: string
  expression?: string
  description?: string
}

export interface SchemaPartition {
  name?: string
  /** Power Query/M expression returned by the scanner for this partition. */
  expression?: string
}

export interface SchemaTable {
  name: string
  isHidden?: boolean
  description?: string
  columns?: SchemaColumn[]
  measures?: SchemaMeasure[]
  /** Power Query/M source expression for this model table, when metadata scanning returns it. */
  sourceExpression?: string
  /** A table may contain multiple partitions, each with its own M expression. */
  partitions?: SchemaPartition[]
}

export interface DatasetExpression {
  name: string
  expression?: string
  description?: string
}

export interface DatasetSchema {
  tables: SchemaTable[]
  expressions: DatasetExpression[]
  /** Storage mode reported by Admin Scanner, e.g. Import/DirectQuery/Composite. */
  storageMode?: string
  /** Dataset-level scanner metadata used to explain model-specific differences. */
  configuredBy?: string
  isRefreshable?: boolean
  /** True when the scanner returned a stale-schema indicator. */
  schemaMayNotBeUpToDate?: boolean
  schemaRetrievalError?: string
  /** 度量值总数 */
  measureCount: number
  /** 列总数 */
  columnCount: number
}

/** 前端展示用的扁平化视图 */
export interface WorkspaceView {
  id: string
  name: string
  type?: string
  state?: string
  isOnDedicatedCapacity?: boolean
  users: PbiWorkspaceUser[]
  reportCount: number
  datasetCount: number
}

export interface ReportView extends PbiReport {
  workspaceId: string
  workspaceName: string
}

export interface DatasetView extends PbiDataset {
  workspaceId: string
  workspaceName: string
  reportCount: number
}

export interface TenantSnapshot {
  /** admin = 管理模式（全租户，管理 API）；member = 成员模式（服务主体可见的工作区） */
  mode: 'admin' | 'member'
  /** 管理 API 不可用时的原因；成员模式仍可正常返回工作区数据 */
  adminFallbackReason?: string
  /** 当前调用服务主体的 Entra 对象 ID，用于和工作区用户 identifier 对应。 */
  activePrincipalObjectId?: string
  fetchedAt: string
  workspaces: WorkspaceView[]
  reports: ReportView[]
  datasets: DatasetView[]
}
