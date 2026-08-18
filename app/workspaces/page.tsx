'use client'

import { useMemo, useState } from 'react'
import { Button, Input, Table, Tag, Tooltip } from 'antd'
import { DownloadOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import dayjs from 'dayjs'
import ErrorAlert from '@/components/ErrorAlert'
import PageHeader from '@/components/PageHeader'
import StaleDataAlert from '@/components/StaleDataAlert'
import TableEmpty from '@/components/TableEmpty'
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
      <PageHeader
        title="工作区"
        description="从租户视角查看工作区规模、容量、成员与内容分布，点击工作区可进入详情继续排查。"
        meta={data ? `数据快照：${dayjs(data.fetchedAt).format('YYYY-MM-DD HH:mm:ss')}` : undefined}
        actions={
          <>
            <Button
              icon={<ReloadOutlined />}
              loading={isValidating}
              onClick={() => mutate(() => fetcher('/api/snapshot?force=1'))}
            >
              刷新
            </Button>
            <Button icon={<DownloadOutlined />} onClick={doExport} disabled={!data}>
              导出 CSV
            </Button>
          </>
        }
      />

      {error && !data && <ErrorAlert error={error} onRetry={() => mutate()} />}
      {error && data && <StaleDataAlert error={error} onRetry={() => mutate()} />}

      <div className="filter-bar">
        <Input
          allowClear
          prefix={<SearchOutlined />}
          placeholder="搜索工作区名称 / ID"
          style={{ width: 320, maxWidth: '100%' }}
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
        <span className="filter-summary">
          {keyword ? `筛选后 ${filtered.length} / ${data?.workspaces.length ?? 0} 个工作区` : `共 ${filtered.length} 个工作区`}
        </span>
      </div>

      <Table<WorkspaceView>
        rowKey="id"
        loading={isLoading}
        dataSource={filtered}
        scroll={{ x: 950 }}
        locale={{
          emptyText: (
            <TableEmpty
              title={keyword ? '没有匹配的工作区' : '暂无工作区'}
              description={keyword ? '尝试调整搜索关键词。' : '当前环境没有可显示的工作区。'}
            />
          ),
        }}
        pagination={{
          pageSize,
          showSizeChanger: true,
          showTotal: (t) => `共 ${t} 个`,
          onShowSizeChange: (_, size) => setPageSize(size),
        }}
        columns={[
          {
            title: '名称',
            dataIndex: 'name',
            ellipsis: true,
            render: (v: string, record) => <a onClick={() => router.push(`/workspaces/${record.id}`)}>{v}</a>,
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
              v === 'Active' ? <Tag color="green">活跃</Tag> : v === 'Removing' ? <Tag color="red">删除中</Tag> : <Tag>{v ?? '-'}</Tag>,
          },
          {
            title: '专用容量',
            dataIndex: 'isOnDedicatedCapacity',
            width: 90,
            render: (v?: boolean) => (v ? <Tag color="gold">Premium</Tag> : <span className="text-muted">共享</span>),
          },
          { title: '成员', dataIndex: 'users', width: 80, render: (u: WorkspaceView['users']) => u.length },
          { title: '报表', dataIndex: 'reportCount', width: 80 },
          { title: '数据集', dataIndex: 'datasetCount', width: 80 },
          {
            title: '管理员',
            ellipsis: { showTitle: false },
            render: (_: unknown, w: WorkspaceView) => {
              const admins = w.users.filter((u) => accessRightOf(u) === 'Admin')
              if (admins.length === 0) return <span className="text-muted">未识别</span>
              const text = admins.map((a) => a.displayName || a.email || a.identifier).join('、')
              return <Tooltip title={text} placement="topLeft">{text}</Tooltip>
            },
          },
        ]}
      />
    </div>
  )
}
