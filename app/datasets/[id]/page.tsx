'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { Button, Card, Descriptions, Drawer, Space, Table, Tag, Typography } from 'antd'
import { ArrowLeftOutlined, ExportOutlined, ReloadOutlined } from '@ant-design/icons'
import useSWR from 'swr'
import DatasourcesModal from '@/components/DatasourcesModal'
import ErrorAlert from '@/components/ErrorAlert'
import PageHeader from '@/components/PageHeader'
import RefreshHistoryDrawer from '@/components/RefreshHistoryDrawer'
import RefreshModal from '@/components/RefreshModal'
import SchemaDrawer from '@/components/SchemaDrawer'
import StaleDataAlert from '@/components/StaleDataAlert'
import TableEmpty from '@/components/TableEmpty'
import UsersTable from '@/components/UsersTable'
import { fetcher } from '@/lib/client'
import { useSnapshot } from '@/lib/use-snapshot'
import { responsiveDrawerWidth } from '@/lib/ui'
import { formatDateTime } from '@/lib/domain/format'
import type { PbiAdminUser } from '@/lib/types'

export default function DatasetDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const datasetId = params.id
  const { data: snapshot, error, isLoading, mutate } = useSnapshot()
  const [refreshOpen, setRefreshOpen] = useState(false)
  const [schemaOpen, setSchemaOpen] = useState(false)
  const [datasourcesOpen, setDatasourcesOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [usersOpen, setUsersOpen] = useState(false)

  const dataset = snapshot?.datasets.find((item) => item.id === datasetId)
  const reports = dataset
    ? (snapshot?.reports ?? []).filter((report) => report.datasetId === dataset.id)
    : []

  const { data: usersData, error: usersError, isLoading: usersLoading } = useSWR<{
    users: PbiAdminUser[]
  }>(
    usersOpen && dataset
      ? `/api/datasets/users?wid=${dataset.workspaceId}&did=${dataset.id}`
      : null,
    fetcher,
  )

  if (error && !snapshot) {
    return <ErrorAlert error={error} onRetry={() => mutate()} />
  }

  if (!isLoading && snapshot && !dataset) {
    return (
      <Card>
        <Typography.Text type="secondary">
          未找到该数据集（快照中不存在，可能已被删除或未同步）。
        </Typography.Text>
        <div style={{ marginTop: 12 }}>
          <Button href="/datasets" icon={<ArrowLeftOutlined />}>
            返回数据集列表
          </Button>
        </div>
      </Card>
    )
  }

  return (
    <div>
      <PageHeader
        title={dataset?.name ?? (isLoading ? '加载中…' : datasetId)}
        description={dataset ? `工作区：${dataset.workspaceName}` : undefined}
        meta={
          dataset ? (
            <Space size={6} wrap>
              <Tag color={dataset.isRefreshable ? 'green' : 'default'}>
                {dataset.isRefreshable ? '可刷新' : '不可刷新'}
              </Tag>
              <Tag color={dataset.isOnPremGatewayRequired ? 'orange' : 'blue'}>
                {dataset.isOnPremGatewayRequired ? '本地网关' : '云端'}
              </Tag>
              <Tag>关联报表 {dataset.reportCount}</Tag>
              {dataset.configuredBy && <Tag>配置者 {dataset.configuredBy}</Tag>}
            </Space>
          ) : undefined
        }
        actions={
          <>
            <Button
              icon={<ArrowLeftOutlined />}
              onClick={() => (window.history.length > 1 ? router.back() : router.push('/datasets'))}
            >
              返回
            </Button>
            <Button
              type="primary"
              icon={<ReloadOutlined />}
              disabled={!dataset?.isRefreshable}
              onClick={() => setRefreshOpen(true)}
            >
              立即刷新
            </Button>
            {dataset?.webUrl && (
              <Typography.Link href={dataset.webUrl} target="_blank">
                打开 Power BI <ExportOutlined />
              </Typography.Link>
            )}
          </>
        }
      />

      {error && snapshot && <StaleDataAlert error={error} onRetry={() => mutate()} />}

      <Card className="section-card" title="数据集信息">
        <Descriptions column={{ xs: 1, sm: 2, lg: 3 }} size="small">
          <Descriptions.Item label="工作区">
            <Link href={`/workspaces/${dataset?.workspaceId ?? ''}`}>{dataset?.workspaceName ?? '-'}</Link>
          </Descriptions.Item>
          <Descriptions.Item label="配置者">{dataset?.configuredBy ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="修改时间">{formatDateTime(dataset?.modifiedDate)}</Descriptions.Item>
          <Descriptions.Item label="关联报表">{dataset?.reportCount ?? reports.length}</Descriptions.Item>
          <Descriptions.Item label="刷新能力">{dataset?.isRefreshable ? '可刷新' : '不可刷新'}</Descriptions.Item>
          <Descriptions.Item label="连接方式">
            {dataset?.isOnPremGatewayRequired ? '本地网关' : '云端'}
          </Descriptions.Item>
          <Descriptions.Item label="数据集 ID" span={3}>
            <Typography.Text copyable style={{ fontSize: 12 }}>
              {dataset?.id ?? datasetId}
            </Typography.Text>
          </Descriptions.Item>
        </Descriptions>

        <Space wrap style={{ marginTop: 12 }}>
          <Button disabled={!dataset} onClick={() => setSchemaOpen(true)}>查看结构</Button>
          <Button disabled={!dataset} onClick={() => setUsersOpen(true)}>查看用户</Button>
          <Button disabled={!dataset} onClick={() => setDatasourcesOpen(true)}>查看数据源</Button>
          <Button disabled={!dataset} onClick={() => setHistoryOpen(true)}>刷新记录</Button>
        </Space>
      </Card>

      <Card className="section-card" title={`关联报表（${reports.length}）`} style={{ marginTop: 16 }}>
        <Table
          rowKey="id"
          size="small"
          loading={isLoading}
          dataSource={reports}
          scroll={{ x: 720 }}
          pagination={{ pageSize: 10, showTotal: (total) => `共 ${total} 张` }}
          locale={{ emptyText: <TableEmpty title={isLoading ? '正在加载…' : '暂无关联报表'} /> }}
          columns={[
            {
              title: '报表',
              dataIndex: 'name',
              ellipsis: true,
              render: (value: string, record) => <Link href={`/reports/${record.id}`}>{value}</Link>,
            },
            { title: '工作区', dataIndex: 'workspaceName', width: 180, ellipsis: true },
            {
              title: '修改时间',
              dataIndex: 'modifiedDateTime',
              width: 145,
              render: (value?: string) => formatDateTime(value),
            },
            {
              title: '操作',
              width: 90,
              render: (_: unknown, record) =>
                record.webUrl ? (
                  <Typography.Link href={record.webUrl} target="_blank">
                    打开
                  </Typography.Link>
                ) : (
                  <span className="text-muted">无链接</span>
                ),
            },
          ]}
        />
      </Card>

      <RefreshModal
        open={refreshOpen}
        dataset={dataset ?? null}
        onClose={() => setRefreshOpen(false)}
        onTriggered={() => setHistoryOpen(true)}
      />
      <SchemaDrawer open={schemaOpen} dataset={dataset ?? null} onClose={() => setSchemaOpen(false)} />
      <DatasourcesModal
        open={datasourcesOpen}
        onClose={() => setDatasourcesOpen(false)}
        datasetId={dataset?.id}
        datasetName={dataset?.name}
        workspaceId={dataset?.workspaceId}
      />
      <RefreshHistoryDrawer open={historyOpen} dataset={dataset ?? null} onClose={() => setHistoryOpen(false)} />
      <Drawer
        open={usersOpen}
        onClose={() => setUsersOpen(false)}
        width={responsiveDrawerWidth(680)}
        title={`数据集用户 — ${dataset?.name ?? ''}`}
      >
        {usersError && <ErrorAlert error={usersError} />}
        <UsersTable users={usersData?.users ?? []} loading={usersLoading} />
      </Drawer>
    </div>
  )
}
