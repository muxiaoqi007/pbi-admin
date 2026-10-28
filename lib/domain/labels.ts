export type TagColor =
  | 'red'
  | 'orange'
  | 'green'
  | 'blue'
  | 'purple'
  | 'gold'
  | 'processing'
  | 'default'

export interface StatusMeta {
  label: string
  color: TagColor
}

export const REFRESH_STATUS_META: Record<string, StatusMeta> = {
  Completed: { label: '成功', color: 'green' },
  Failed: { label: '失败', color: 'red' },
  InProgress: { label: '进行中', color: 'processing' },
  NotStarted: { label: '排队中', color: 'gold' },
  Unknown: { label: '未知', color: 'default' },
}

export function refreshStatusMeta(status?: string): StatusMeta {
  if (!status) return { label: '无记录', color: 'default' }
  return REFRESH_STATUS_META[status] ?? { label: status, color: 'default' }
}

export function workspaceTypeMeta(type?: string): StatusMeta {
  if (type === 'Personal' || type === 'PersonalGroup') return { label: '个人', color: 'default' }
  if (type === 'AdminWorkspace') return { label: '管理', color: 'purple' }
  return { label: '工作区', color: 'blue' }
}

export function workspaceTypeLabel(type?: string): string {
  const meta = workspaceTypeMeta(type)
  if (type === 'Personal' || type === 'PersonalGroup') return '个人工作区'
  if (type === 'AdminWorkspace') return '管理工作区'
  return meta.label
}

export function workspaceStateMeta(state?: string): StatusMeta {
  if (state === 'Active') return { label: '活跃', color: 'green' }
  if (state === 'Removing') return { label: '删除中', color: 'red' }
  return { label: state ?? '未知', color: 'default' }
}

export const ROLE_META: Record<string, StatusMeta> = {
  Admin: { label: '管理员', color: 'red' },
  Member: { label: '成员', color: 'orange' },
  Contributor: { label: '参与者', color: 'blue' },
  Viewer: { label: '查看者', color: 'default' },
  Owner: { label: '所有者', color: 'red' },
  ReadWrite: { label: '读写', color: 'blue' },
}

export function roleMeta(role?: string): StatusMeta | undefined {
  if (!role) return undefined
  return ROLE_META[role] ?? { label: role, color: 'default' }
}
