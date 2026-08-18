'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Card, Descriptions, Dropdown, Drawer, Space, Table, Tabs, Tag, Tooltip, Typography } from 'antd'
import { ArrowLeftOutlined, MoreOutlined, ReloadOutlined } from '@ant-design/icons'
import useSWR from 'swr'
import dayjs from 'dayjs'
import DatasourcesModal from '@/components/DatasourcesModal'
import ErrorAlert from '@/components/ErrorAlert'
import RefreshHistoryDrawer from '@/components/RefreshHistoryDrawer'
import RefreshModal from '@/components/RefreshModal'
import SchemaDrawer from '@/components/SchemaDrawer'
import StaleDataAlert from '@/components/StaleDataAlert'
import UsersTable from '@/components/UsersTable'
import { fetcher } from '@/lib/client'
import type { DatasetView, PbiAdminUser, TenantSnapshot } from '@/lib/types'

export default function WorkspaceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  const [workspaceId, setWorkspaceId] = useState('')
  const [historyDataset, setHistoryDataset] = useState<DatasetView | null>(null)
  const [refreshDataset, setRefreshDataset] = useState<DatasetView | null>(null)
  const [usersDataset, setUsersDataset] = useState<DatasetView | null>(null)
  const [schemaDataset, setSchemaDataset] = useState<DatasetView | null>(null)
  const [datasourceDataset, setDatasourceDataset] = useState<DatasetView | null>(null)

  useEffect(() => {
    params.then(({ id }) => setWorkspaceId(id))
  }, [params])

  const { data, error, isLoading, mutate, isValidating } = useSWR<TenantSnapshot>(
    '/api/snapshot',
    fetcher,
    { keepPreviousData: true },
  )

  const { data: usersData, error: usersError, isLoading: usersLoading } = useSWR<{
    users: PbiAdminUser[]
  }>(
    usersDataset ? `/api/datasets/users?wid=${usersDataset.workspaceId}&did=${usersDataset.id}` : null,
    fetcher,
  )

  const workspace = data?.workspaces.find((w) => w.id === workspaceId)
  const reports = useMemo(
    () => (data?.reports ?? []).filter((r) => r.workspaceId === workspaceId),
    [data, workspaceId],
  )
  const datasets = useMemo(
    () => (data?.datasets ?? []).filter((d) => d.workspaceId === workspaceId),
    [data, workspaceId],
  )

  if (error && !data) {
    return <ErrorAlert error={error} onRetry={() => mutate()} />
  }
  if (!isLoading && data && !workspace) {
    return (
      <Card>
        <Typography.Text type="secondary">未找到该工作区（快照中不存在，可能已被删除或未同步）。</Typography.Text>
        <div style={{ marginTop: 12 }}>
          <Button icon={<ArrowLeftOutlined />} onClick={() => router.push('/workspaces')}>
            返回工作区列表
          </Button>
        </div>
      </Card>
    )
  }

  return (
    <div>
      {error && data && <StaleDataAlert error={error} onRetry={() => mutate()} />}
      <Space style={{ marginBottom: 12 }} wrap>
        <Button icon={<ArrowLeftOutlined />} onClick={() => router.push('/workspaces')}>
          返回
        </Button>
        <Typography.Title level={4} style={{ margin: 0 }}>
          {workspace?.name ?? (isLoading ? '加载中…' : workspaceId)}
        </Typography.Title>
        <Button
          icon={<ReloadOutlined />}
          loading={isValidating}
          onClick={() => mutate(() => fetcher('/api/snapshot?force=1'))}
        >
          刷新
        </Button>
      </Space>

      <Card style={{ marginBottom: 16 }}>
        <Descriptions column={{ xs: 1, sm: 2, lg: 3 }} size="small">
          <Descriptions.Item label="工作区 ID">
            <Typography.Text copyable style={{ fontSize: 12 }}>{workspaceId}</Typography.Text>
          </Descriptions.Item>
          <Descriptions.Item label="类型">{workspace?.type ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="状态">{workspace?.state ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="报表数">{reports.length}</Descriptions.Item>
          <Descriptions.Item label="数据集数">{datasets.length}</Descriptions.Item>
          <Descriptions.Item label="成员数">{workspace?.users.length ?? 0}</Descriptions.Item>
        </Descriptions>
      </Card>

      <Tabs
        items={[
          {
            key: 'users',
            label: `成员（${workspace?.users.length ?? 0}）`,
            children: <UsersTable users={workspace?.users ?? []} loading={isLoading} />,
          },
          {
            key: 'reports',
            label: `报表（${reports.length}）`,
            children: (
              <Table
                rowKey="id"
                size="small"
                loading={isLoading}
                dataSource={reports}
                scroll={{ x: 720 }}
                pagination={{ pageSize: 20, showTotal: (t) => `共 ${t} 张` }}
                columns={[
                  { title: '名称', dataIndex: 'name', ellipsis: true },
                  { title: '类型', dataIndex: 'reportType', width: 140 },
                  {
                    title: '修改时间',
                    dataIndex: 'modifiedDateTime',
                    width: 170,
                    render: (v?: string) => (v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '-'),
                  },
                  {
                    title: '操作',
                    width: 90,
                    render: (_: unknown, r) =>
                      r.webUrl ? (
                        <Typography.Link href={r.webUrl} target="_blank">
                          打开
                        </Typography.Link>
                      ) : (
                        '-'
                      ),
                  },
                ]}
              />
            ),
          },
          {
            key: 'datasets',
            label: `数据集（${datasets.length}）`,
            children: (
              <Table
                rowKey="id"
                size="small"
                loading={isLoading}
                dataSource={datasets}
                scroll={{ x: 780 }}
                pagination={{ pageSize: 20, showTotal: (t) => `共 ${t} 个` }}
                columns={[
                  { title: '名称', dataIndex: 'name', ellipsis: true },
                  {
                    title: '可刷新',
                    dataIndex: 'isRefreshable',
                    width: 80,
                    render: (v?: boolean) => (v ? <Tag color="green">是</Tag> : '-'),
                  },
                  {
                    title: '网关',
                    dataIndex: 'isOnPremGatewayRequired',
                    width: 70,
                    render: (v?: boolean) => (v ? <Tag color="orange">本地</Tag> : '云'),
                  },
                  { title: '关联报表', dataIndex: 'reportCount', width: 90 },
                  {
                    title: '操作',
                    width: 190,
                    fixed: 'right',
                    render: (_: unknown, d: DatasetView) => (
                      <Space size={4}>
                        <Tooltip title={d.isRefreshable ? undefined : '该数据集当前不可刷新'}>
                          <Button
                            type="link"
                            size="small"
                            disabled={!d.isRefreshable}
                            onClick={() => setRefreshDataset(d)}
                            style={{ paddingInline: 0 }}
                          >
                            立即刷新
                          </Button>
                        </Tooltip>
                        <Dropdown
                          trigger={['click']}
                          menu={{
                            items: [
                              { key: 'users', label: '用户', onClick: () => setUsersDataset(d) },
                              { key: 'schema', label: '结构', onClick: () => setSchemaDataset(d) },
                              { key: 'datasources', label: '数据源', onClick: () => setDatasourceDataset(d) },
                              { key: 'history', label: '刷新记录', onClick: () => setHistoryDataset(d) },
                            ],
                          }}
                        >
                          <a onClick={(e) => e.preventDefault()}>
                            <MoreOutlined /> 更多
                          </a>
                        </Dropdown>
                      </Space>
                    ),
                  },
                ]}
              />
            ),
          },
        ]}
      />

      <RefreshHistoryDrawer
        open={!!historyDataset}
        dataset={historyDataset}
        onClose={() => setHistoryDataset(null)}
      />
      <RefreshModal
        open={!!refreshDataset}
        dataset={refreshDataset}
        onClose={() => setRefreshDataset(null)}
        onTriggered={() => {
          if (refreshDataset) setHistoryDataset(refreshDataset)
        }}
      />
      <Drawer
        open={!!usersDataset}
        onClose={() => setUsersDataset(null)}
        width={680}
        title={`数据集用户 — ${usersDataset?.name ?? ''}`}
      >
        {usersError && <ErrorAlert error={usersError} />}
        <UsersTable users={usersData?.users ?? []} loading={usersLoading} />
      </Drawer>
      <SchemaDrawer
        open={!!schemaDataset}
        dataset={schemaDataset}
        onClose={() => setSchemaDataset(null)}
      />
      <DatasourcesModal
        open={!!datasourceDataset}
        onClose={() => setDatasourceDataset(null)}
        datasetId={datasourceDataset?.id}
        datasetName={datasourceDataset?.name}
        workspaceId={datasourceDataset?.workspaceId}
      />
    </div>
  )
}
