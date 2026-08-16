'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Card, Descriptions, Space, Table, Tabs, Tag, Typography } from 'antd'
import { ArrowLeftOutlined } from '@ant-design/icons'
import useSWR from 'swr'
import dayjs from 'dayjs'
import ErrorAlert from '@/components/ErrorAlert'
import RefreshHistoryDrawer from '@/components/RefreshHistoryDrawer'
import RefreshModal from '@/components/RefreshModal'
import UsersTable from '@/components/UsersTable'
import { fetcher } from '@/lib/client'
import type { DatasetView, TenantSnapshot } from '@/lib/types'

export default function WorkspaceDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const [historyDataset, setHistoryDataset] = useState<DatasetView | null>(null)
  const [refreshDataset, setRefreshDataset] = useState<DatasetView | null>(null)

  const { data, error, isLoading, mutate } = useSWR<TenantSnapshot>(
    '/api/snapshot',
    fetcher,
    { keepPreviousData: true },
  )

  const workspace = data?.workspaces.find((w) => w.id === params.id)
  const reports = useMemo(
    () => (data?.reports ?? []).filter((r) => r.workspaceId === params.id),
    [data, params.id],
  )
  const datasets = useMemo(
    () => (data?.datasets ?? []).filter((d) => d.workspaceId === params.id),
    [data, params.id],
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
      <Space style={{ marginBottom: 12 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => router.push('/workspaces')}>
          返回
        </Button>
        <Typography.Title level={4} style={{ margin: 0 }}>
          {workspace?.name ?? (isLoading ? '加载中…' : params.id)}
        </Typography.Title>
      </Space>

      <Card style={{ marginBottom: 16 }}>
        <Descriptions column={3} size="small">
          <Descriptions.Item label="工作区 ID">
            <Typography.Text copyable style={{ fontSize: 12 }}>{params.id}</Typography.Text>
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
                pagination={{ pageSize: 20 }}
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
                    render: (_: unknown, r) => (
                      <Typography.Link href={r.webUrl} target="_blank">
                        打开
                      </Typography.Link>
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
                pagination={{ pageSize: 20 }}
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
                    width: 170,
                    render: (_: unknown, d: DatasetView) => (
                      <Space size={4}>
                        <a onClick={() => setHistoryDataset(d)}>刷新记录</a>
                        <a onClick={() => setRefreshDataset(d)}>立即刷新</a>
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
        onTriggered={() => setHistoryDataset(refreshDataset)}
      />
    </div>
  )
}
