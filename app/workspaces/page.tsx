'use client'

import { useMemo, useState } from 'react'
import { Button, Input, Table, Tag, Tooltip } from 'antd'
import { DownloadOutlined, SearchOutlined } from '@ant-design/icons'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import ErrorAlert from '@/components/ErrorAlert'
import { accessRightOf } from '@/components/UsersTable'
import { fetcher } from '@/lib/client'
import { exportCSV } from '@/lib/export'
import type { TenantSnapshot, WorkspaceView } from '@/lib/types'

export default function WorkspacesPage() {
  const router = useRouter()
  const [keyword, setKeyword] = useState('')
  const [pageSize, setPageSize] = useState(20)
  const { data, error, isLoading, mutate, isValidating } = useSWR<TenantSnapshot>(
    '/api/snapshot',
    fetcher,
    { keepPreviousData: true },
  )

  const filtered = useMemo(() => {
    const k = keyword.trim().toLowerCase()
    if (!k) return data?.workspaces ?? []
    return (data?.workspaces ?? []).filter(
      (w) => w.name.toLowerCase().includes(k) || w.id.toLowerCase().includes(k),
    )
  }, [data, keyword])

  function doExport() {
    exportCSV(
      `工作区清单_${new Date().toISOString().slice(0, 10)}.csv`,
      ['名称', 'ID', '类型', '状态', '专用容量', '成员数', '报表数', '数据集数', '管理员'],
      filtered.map((w) => [
        w.name,
        w.id,
        w.type === 'Personal' ? '个人' : w.type === 'AdminWorkspace' ? '管理' : '工作区',
        w.state ?? '',
        w.isOnDedicatedCapacity ? '是' : '否',
        w.users.length,
        w.reportCount,
        w.datasetCount,
        w.users
          .filter((u) => accessRightOf(u) === 'Admin')
          .map((u) => u.displayName || u.email || u.identifier)
          .join('、'),
      ]),
    )
  }

  return (
    <div>
      {error && !data && <ErrorAlert error={error} onRetry={() => mutate()} />}
      <div className="table-toolbar">
        <Input
          allowClear
          prefix={<SearchOutlined />}
          placeholder="搜索工作区名称 / ID"
          style={{ width: 300 }}
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
        <span className="text-muted">共 {filtered.length} 个工作区</span>
        <Button icon={<DownloadOutlined />} onClick={doExport} disabled={!data}>
          导出 CSV
        </Button>
      </div>
      <Table<WorkspaceView>
        rowKey="id"
        loading={isLoading}
        dataSource={filtered}
        pagination={{ pageSize, showSizeChanger: true, showTotal: (t) => `共 ${t} 个`, onShowSizeChange: (_, size) => setPageSize(size) }}
        columns={[
          {
            title: '名称',
            dataIndex: 'name',
            ellipsis: true,
            render: (v: string, record) => (
              <a onClick={() => router.push(`/workspaces/${record.id}`)}>{v}</a>
            ),
          },
          {
            title: '类型',
            dataIndex: 'type',
            width: 90,
            render: (v?: string) =>
              v === 'Personal' ? <Tag>个人</Tag> : v === 'AdminWorkspace' ? <Tag color="purple">管理</Tag> : <Tag color="blue">工作区</Tag>,
          },
          {
            title: '状态',
            dataIndex: 'state',
            width: 90,
            render: (v?: string) =>
              v === 'Active' ? <Tag color="green">活跃</Tag> : <Tag>{v ?? '-'}</Tag>,
          },
          {
            title: '专用容量',
            dataIndex: 'isOnDedicatedCapacity',
            width: 90,
            render: (v?: boolean) => (v ? <Tag color="gold">Premium</Tag> : '-'),
          },
          { title: '成员', dataIndex: 'users', width: 80, render: (u: WorkspaceView['users']) => u.length },
          { title: '报表', dataIndex: 'reportCount', width: 80 },
          { title: '数据集', dataIndex: 'datasetCount', width: 80 },
          {
            title: '管理员',
            ellipsis: { showTitle: false },
            render: (_: unknown, w: WorkspaceView) => {
              const admins = w.users.filter((u) => accessRightOf(u) === 'Admin')
              if (admins.length === 0) return '-'
              const text = admins.map((a) => a.displayName || a.email || a.identifier).join('、')
              return (
                <Tooltip title={text} placement="topLeft">
                  {text}
                </Tooltip>
              )
            },
          },
        ]}
      />
      {isValidating && data && <p className="text-muted">正在刷新…</p>}
    </div>
  )
}
