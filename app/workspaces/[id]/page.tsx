'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button, Card, Descriptions, Space, Table, Tabs, Tag, Tooltip, Typography } from 'antd'
import { ArrowLeftOutlined, ReloadOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import ErrorAlert from '@/components/ErrorAlert'
import PageHeader from '@/components/PageHeader'
import RefreshModal from '@/components/RefreshModal'
import StaleDataAlert from '@/components/StaleDataAlert'
import TableEmpty from '@/components/TableEmpty'
import UsersTable from '@/components/UsersTable'
import { fetcher } from '@/lib/client'
import { useSnapshot } from '@/lib/use-snapshot'
import { useUrlState } from '@/lib/use-url-state'
import { formatDateTime } from '@/lib/domain/format'
import { workspaceStateMeta, workspaceTypeLabel } from '@/lib/domain/labels'
import type { DatasetView } from '@/lib/types'

const VIEW_DEFAULTS = { tab: 'users' }

export default function WorkspaceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  const { values: viewState, setValues: setViewState } = useUrlState(VIEW_DEFAULTS)
  const activeTab = ['users', 'reports', 'datasets'].includes(viewState.tab) ? viewState.tab : 'users'
  const [workspaceId, setWorkspaceId] = useState('')
  const [refreshDataset, setRefreshDataset] = useState<DatasetView | null>(null)

  useEffect(() => {
    params.then(({ id }) => setWorkspaceId(id))
  }, [params])

  const { data, error, isLoading, mutate, isValidating } = useSnapshot()

  const workspace = data?.workspaces.find((w) => w.id === workspaceId)
  const reports = useMemo(
    () => (data?.reports ?? []).filter((r) => r.workspaceId === workspaceId),
    [data, workspaceId],
  )
  const datasets = useMemo(
    () => (data?.datasets ?? []).filter((d) => d.workspaceId === workspaceId),
    [data, workspaceId],
  )
  const refreshableDatasets = datasets.filter((d) => d.isRefreshable).length

  if (error && !data) return <ErrorAlert error={error} onRetry={() => mutate()} />

  if (!isLoading && data && !workspace) {
    return (
      <div>
        <PageHeader
          title="工作区不存在"
          description="当前快照中没有找到该工作区，可能已删除、无权限访问或尚未同步。"
          actions={<Button icon={<ArrowLeftOutlined />} onClick={() => router.push('/workspaces')}>返回工作区</Button>}
        />
        <Card className="section-card">
          <TableEmpty title="未找到工作区" description={`工作区 ID：${workspaceId || '未知'}`} />
        </Card>
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title={workspace?.name ?? (isLoading ? '加载工作区…' : workspaceId)}
        description="查看工作区成员、报表和数据集，并从这里继续进入刷新、结构与数据源排查。"
        meta={
          data
            ? `工作区 ID：${workspaceId} · 数据快照：${dayjs(data.fetchedAt).format('YYYY-MM-DD HH:mm:ss')}`
            : workspaceId
              ? `工作区 ID：${workspaceId}`
              : undefined
        }
        actions={
          <>
            <Button
              icon={<ArrowLeftOutlined />}
              onClick={() => (window.history.length > 1 ? router.back() : router.push('/workspaces'))}
            >
              返回
            </Button>
            <Button
              icon={<ReloadOutlined />}
              loading={isValidating}
              onClick={() => mutate(() => fetcher('/api/snapshot?force=1'))}
            >
              刷新
            </Button>
          </>
        }
      />

      {error && data && <StaleDataAlert error={error} onRetry={() => mutate()} />}

      <Card className="section-card" style={{ marginBottom: 16 }}>
        <Descriptions column={{ xs: 1, sm: 2, lg: 3 }} size="small">
          <Descriptions.Item label="状态">
            {(() => {
              const meta = workspaceStateMeta(workspace?.state)
              return <Tag color={meta.color}>{meta.label}</Tag>
            })()}
          </Descriptions.Item>
          <Descriptions.Item label="类型">{workspaceTypeLabel(workspace?.type)}</Descriptions.Item>
          <Descriptions.Item label="容量">
            {workspace?.isOnDedicatedCapacity ? <Tag color="gold">Premium</Tag> : <Tag>共享容量</Tag>}
          </Descriptions.Item>
          <Descriptions.Item label="成员">{workspace?.users.length ?? 0}</Descriptions.Item>
          <Descriptions.Item label="报表">{reports.length}</Descriptions.Item>
          <Descriptions.Item label="数据集">{datasets.length}（可刷新 {refreshableDatasets}）</Descriptions.Item>
          <Descriptions.Item label="工作区 ID" span={3}>
            <Typography.Text copyable style={{ fontSize: 12 }}>{workspaceId}</Typography.Text>
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Card className="section-card" styles={{ body: { paddingTop: 8 } }}>
        <Tabs
          activeKey={activeTab}
          onChange={(key) => setViewState({ tab: key })}
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
                  locale={{ emptyText: <TableEmpty title="该工作区暂无报表" /> }}
                  pagination={{ pageSize: 20, showTotal: (t) => `共 ${t} 张` }}
                  columns={[
                    {
                      title: '名称',
                      dataIndex: 'name',
                      ellipsis: true,
                      render: (value: string, record) => <Link href={`/reports/${record.id}`}>{value}</Link>,
                    },
                    { title: '类型', dataIndex: 'reportType', width: 140, render: (v?: string) => v ?? <span className="text-muted">未知</span> },
                    {
                      title: '修改时间',
                      dataIndex: 'modifiedDateTime',
                      width: 170,
                      render: (v?: string) => formatDateTime(v),
                    },
                    {
                      title: '操作',
                      width: 150,
                      render: (_: unknown, r) => (
                        <Space size={10}>
                          <Link href={`/reports/${r.id}`}>详情</Link>
                          {r.webUrl ? (
                            <Typography.Link href={r.webUrl} target="_blank">
                              打开
                            </Typography.Link>
                          ) : (
                            <span className="text-muted">无链接</span>
                          )}
                        </Space>
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
                  scroll={{ x: 1050 }}
                  locale={{ emptyText: <TableEmpty title="该工作区暂无数据集" /> }}
                  pagination={{ pageSize: 20, showTotal: (t) => `共 ${t} 个` }}
                  columns={[
                    {
                      title: '名称',
                      dataIndex: 'name',
                      ellipsis: true,
                      render: (value: string, record) => <Link href={`/datasets/${record.id}`}>{value}</Link>,
                    },
                    {
                      title: '刷新能力',
                      dataIndex: 'isRefreshable',
                      width: 90,
                      render: (v?: boolean) => (v ? <Tag color="green">可刷新</Tag> : <Tag>不可刷新</Tag>),
                    },
                    {
                      title: '连接',
                      dataIndex: 'isOnPremGatewayRequired',
                      width: 95,
                      render: (v?: boolean) => (v ? <Tag color="orange">本地网关</Tag> : <Tag color="blue">云端</Tag>),
                    },
                    { title: '关联报表', dataIndex: 'reportCount', width: 90 },
                    {
                      title: '配置者',
                      dataIndex: 'configuredBy',
                      width: 150,
                      ellipsis: true,
                      render: (v?: string) => v ?? <span className="text-muted">未知</span>,
                    },
                    {
                      title: '修改时间',
                      dataIndex: 'modifiedDate',
                      width: 145,
                      render: (v?: string) => formatDateTime(v),
                    },
                    {
                      title: '操作',
                      width: 140,
                      fixed: 'right',
                      render: (_: unknown, d: DatasetView) => (
                        <Space size={12}>
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
                          <Link href={`/datasets/${d.id}`}>详情</Link>
                        </Space>
                      ),
                    },
                  ]}
                />
              ),
            },
          ]}
        />
      </Card>

      <RefreshModal
        open={!!refreshDataset}
        dataset={refreshDataset}
        onClose={() => setRefreshDataset(null)}
      />
    </div>
  )
}
