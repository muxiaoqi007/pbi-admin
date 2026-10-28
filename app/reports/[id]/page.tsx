'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { Button, Card, Descriptions, Drawer, Space, Table, Tag, Typography } from 'antd'
import { ArrowLeftOutlined, ExportOutlined } from '@ant-design/icons'
import useSWR from 'swr'
import DatasourcesModal from '@/components/DatasourcesModal'
import ErrorAlert from '@/components/ErrorAlert'
import PageHeader from '@/components/PageHeader'
import StaleDataAlert from '@/components/StaleDataAlert'
import TableEmpty from '@/components/TableEmpty'
import UsersTable from '@/components/UsersTable'
import { fetcher } from '@/lib/client'
import { useSnapshot } from '@/lib/use-snapshot'
import { responsiveDrawerWidth } from '@/lib/ui'
import { formatDateTime } from '@/lib/domain/format'
import type { PbiAdminUser, PbiReportPage } from '@/lib/types'

export default function ReportDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const reportId = params.id
  const { data: snapshot, error, isLoading, mutate } = useSnapshot()
  const [usersOpen, setUsersOpen] = useState(false)
  const [datasourcesOpen, setDatasourcesOpen] = useState(false)

  const report = snapshot?.reports.find((item) => item.id === reportId)
  const dataset = report?.datasetId
    ? snapshot?.datasets.find((item) => item.id === report.datasetId)
    : undefined

  const { data: usersData, error: usersError, isLoading: usersLoading } = useSWR<{
    users: PbiAdminUser[]
  }>(usersOpen && report ? `/api/reports/${report.id}/users` : null, fetcher)

  const { data: pagesData, error: pagesError, isLoading: pagesLoading } = useSWR<{
    pages: PbiReportPage[]
  }>(
    report ? `/api/reports/pages?wid=${report.workspaceId}&rid=${report.id}` : null,
    fetcher,
  )

  if (error && !snapshot) {
    return <ErrorAlert error={error} onRetry={() => mutate()} />
  }

  if (!isLoading && snapshot && !report) {
    return (
      <Card>
        <Typography.Text type="secondary">
          未找到该报表（快照中不存在，可能已被删除或未同步）。
        </Typography.Text>
        <div style={{ marginTop: 12 }}>
          <Button href="/reports" icon={<ArrowLeftOutlined />}>
            返回报表列表
          </Button>
        </div>
      </Card>
    )
  }

  return (
    <div>
      <PageHeader
        title={report?.name ?? (isLoading ? '加载中…' : reportId)}
        description={report ? `工作区：${report.workspaceName}` : undefined}
        meta={
          report ? (
            <Space size={6} wrap>
              {report.reportType && <Tag>{report.reportType}</Tag>}
              {dataset ? <Tag>数据集 {dataset.name}</Tag> : <Tag>未绑定数据集</Tag>}
              <Tag>页面 {pagesLoading ? '加载中…' : (pagesData?.pages?.length ?? 0)}</Tag>
            </Space>
          ) : undefined
        }
        actions={
          <>
            <Button
              icon={<ArrowLeftOutlined />}
              onClick={() => (window.history.length > 1 ? router.back() : router.push('/reports'))}
            >
              返回
            </Button>
            {report?.webUrl && (
              <Button type="primary" href={report.webUrl} target="_blank">
                打开 Power BI <ExportOutlined />
              </Button>
            )}
          </>
        }
      />

      {error && snapshot && <StaleDataAlert error={error} onRetry={() => mutate()} />}

      <Card className="section-card" title="报表信息">
        <Descriptions column={{ xs: 1, sm: 2, lg: 3 }} size="small">
          <Descriptions.Item label="工作区">
            <Link href={`/workspaces/${report?.workspaceId ?? ''}`}>{report?.workspaceName ?? '-'}</Link>
          </Descriptions.Item>
          <Descriptions.Item label="数据集">
            {dataset ? (
              <Link href={`/datasets/${dataset.id}`}>{dataset.name}</Link>
            ) : (
              <span className="text-muted">未绑定</span>
            )}
          </Descriptions.Item>
          <Descriptions.Item label="类型">{report?.reportType ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="修改时间">{formatDateTime(report?.modifiedDateTime)}</Descriptions.Item>
          <Descriptions.Item label="修改者">{report?.modifiedBy ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="报表 ID">
            <Typography.Text copyable style={{ fontSize: 12 }}>
              {report?.id ?? reportId}
            </Typography.Text>
          </Descriptions.Item>
        </Descriptions>

        <Space wrap style={{ marginTop: 12 }}>
          <Button disabled={!report} onClick={() => setUsersOpen(true)}>查看用户</Button>
          <Button disabled={!report?.datasetId} onClick={() => setDatasourcesOpen(true)}>
            查看数据源
          </Button>
        </Space>
      </Card>

      <Card className="section-card" title={`报表页面（${pagesData?.pages?.length ?? 0}）`} style={{ marginTop: 16 }}>
        {pagesError && <ErrorAlert error={pagesError} />}
        <Table
          rowKey={(page, index) => `${page.name ?? page.displayName ?? index}`}
          size="small"
          loading={isLoading || pagesLoading}
          dataSource={pagesData?.pages ?? []}
          pagination={false}
          locale={{
            emptyText: (
              <TableEmpty
                title={isLoading ? '正在加载报表…' : pagesLoading ? '正在加载页面…' : '暂无页面信息'}
              />
            ),
          }}
          columns={[
            {
              title: '序号',
              dataIndex: 'order',
              width: 70,
              render: (value?: number) => value ?? '-',
            },
            {
              title: '页面名称',
              dataIndex: 'displayName',
              ellipsis: true,
              render: (value?: string) => value ?? '-',
            },
            { title: '页面 ID', dataIndex: 'name', width: 260, ellipsis: true },
          ]}
        />
      </Card>

      <Drawer
        open={usersOpen}
        onClose={() => setUsersOpen(false)}
        width={responsiveDrawerWidth(680)}
        title={`报表用户 — ${report?.name ?? ''}`}
      >
        {usersError && <ErrorAlert error={usersError} />}
        <UsersTable users={usersData?.users ?? []} loading={usersLoading} />
      </Drawer>

      <DatasourcesModal
        open={datasourcesOpen}
        onClose={() => setDatasourcesOpen(false)}
        datasetId={report?.datasetId}
        datasetName={dataset?.name ?? report?.datasetId ?? '（报表未绑定数据集）'}
        workspaceId={dataset?.workspaceId ?? report?.workspaceId}
      />
    </div>
  )
}
