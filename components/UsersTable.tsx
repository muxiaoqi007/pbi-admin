'use client'

import { Table, Tag, Tooltip } from 'antd'
import type { PbiAdminUser, PbiWorkspaceUser } from '@/lib/types'

export function accessRightOf(u: PbiAdminUser | PbiWorkspaceUser): string | undefined {
  const a = u as PbiAdminUser
  return a.groupUserAccessRight ?? a.reportUserAccessRight ?? a.datasetUserAccessRight ?? a.dashboardUserAccessRight
}

const ROLE_COLOR: Record<string, string> = {
  Admin: 'red',
  Member: 'orange',
  Contributor: 'blue',
  Viewer: 'default',
}

/** 工作区 / 报表 / 数据集共用的用户列表 */
export default function UsersTable({
  users,
  loading,
}: {
  users: (PbiAdminUser | PbiWorkspaceUser)[]
  loading?: boolean
}) {
  return (
    <Table
      rowKey={(u) => u.identifier + accessRightOf(u)}
      loading={loading}
      dataSource={users}
      pagination={{ pageSize: 20, showSizeChanger: false, showTotal: (t) => `共 ${t} 人` }}
      columns={[
        {
          title: '用户',
          dataIndex: 'displayName',
          render: (_: unknown, u: PbiAdminUser) => u.displayName || u.email || u.identifier,
        },
        {
          title: '标识',
          dataIndex: 'identifier',
          ellipsis: { showTitle: false },
          render: (v: string) => (
            <Tooltip title={v} placement="topLeft">
              {v}
            </Tooltip>
          ),
        },
        {
          title: '类型',
          dataIndex: 'principalType',
          width: 100,
          render: (v?: string) =>
            v === 'User' ? '用户' : v === 'Group' ? '组' : v === 'App' ? '服务主体' : v ?? '-',
        },
        {
          title: '角色',
          dataIndex: 'role',
          width: 110,
          render: (_: unknown, u: PbiAdminUser) => {
            const role = accessRightOf(u)
            return role ? <Tag color={ROLE_COLOR[role] ?? 'default'}>{role}</Tag> : '-'
          },
        },
      ]}
    />
  )
}
