// Power BI REST API 实体类型（仅声明本工具用到的字段，其余字段一律可选）

export type CloudEnv = 'global' | 'china'

export interface AppConfig {
  cloud: CloudEnv
  tenantId: string
  clientId: string
  clientSecret: string
  /** 覆盖默认的认证地址（如世纪互联 authority 迁移时） */
  authorityOverride?: string
  /** 覆盖默认的 API 基地址 */
  apiBaseOverride?: string
  /** 覆盖默认的 token resource（v1 认证流） */
  resourceOverride?: string
}

/** 认证地址 / API 地址 / resource 都已解析完毕的运行时配置 */
export interface RuntimeConfig extends AppConfig {
  authority: string
  apiBase: string
  resource: string
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

export interface PbiRefresh {
  id: string
  refreshType?: string
  startTime: string
  endTime?: string
  status?: string // NotStarted | InProgress | Unknown | Completed | Failed
  serviceExceptionJson?: string
  requestSentOn?: string
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
  fetchedAt: string
  workspaces: WorkspaceView[]
  reports: ReportView[]
  datasets: DatasetView[]
}
