'use client'

import { useMemo, useState } from 'react'
import { Input, Modal, Space, Table, Tag, Typography } from 'antd'
import { ExportOutlined, SearchOutlined } from '@ant-design/icons'
import useSWR from 'swr'
import dayjs from 'dayjs'
import DatasourcesModal from '@/components/DatasourcesModal'
import ErrorAlert from '@/components/ErrorAlert'
import RefreshHistoryDrawer from '@/components/RefreshHistoryDrawer'
import RefreshModal from '@/components/RefreshModal'
import { fetcher } from '@/lib/client'
import type { DatasetView, TenantSnapshot } from '@/lib/types'

export default function DatasetsPage() {
  const [keyword, setKeyword] = useState('')
  const [datasourceDataset, setDatasourceDataset] = useState<DatasetView | null>(null)
  const [reportsDataset, setReportsDataset] = useState<DatasetView | null>(null)
  const [historyDataset, setHistoryDataset] = useState<DatasetView | null>(null)
  const [refreshDataset, setRefreshDataset] = useState<DatasetView | null>(null)

  const { data, error, isLoading, mutate, isValidating } = useSWR<TenantSnapshot>(
    '/api/snapshot',
    fetcher,
    { keepPreviousData: true },
  )

  const filtered = useMemo(() => {
    const k = keyword.trim().toLowerCase()
    if (!k) return data?.datasets ?? []
    return (data?.datasets ?? []).filter(
      (d) => d.name.toLowerCase().includes(k) || d.workspaceName.toLowerCase().includes(k),
    )
  }, [data, keyword])

  const boundReports = useMemo(
    () => (data?.reports ?? []).filter((r) => r.datasetId === reportsDataset?.id),
    [data, reportsDataset],
  )

  return (
    <div>
      {error && !data && <ErrorAlert error={error} onRetry={() => mutate()} />}
      <div className="table-toolbar">
        <Input
          allowClear
          prefix={<SearchOutlined />}
          placeholder="搜索数据集名称 / 工作区"
          style={{ width: 320 }}
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
        <span className="text-muted">共 {filtered.length} 个数据集</span>
        {isValidating && data && <span className="text-muted">（正在刷新…）</span>}
      </div>
      <Table<DatasetView>
        rowKey="id"
        loading={isLoading}
        dataSource={filtered}
        pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `共 ${t} 个` }}
        columns={[
          { title: '数据集', dataIndex: 'name', ellipsis: true },
          { title: '工作区', dataIndex: 'workspaceName', width: 170, ellipsis: true },
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
            title: '修改时间',
            dataIndex: 'modifiedDate',
            width: 160,
            render: (v?: string) => (v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '-'),
          },
          {
            title: '操作',
            width: 260,
            render: (_: unknown, d) => (
              <Space size={12} split={<span className="text-muted">·</span>}>
                <a onClick={() => setDatasourceDataset(d)}>数据源</a>
                <a onClick={() => setReportsDataset(d)}>关联报表</a>
                <a onClick={() => setHistoryDataset(d)}>刷新记录</a>
                <a onClick={() => setRefreshDataset(d)}>立即刷新</a>
              </Space>
            ),
          },
        ]}
      />

      <DatasourcesModal
        open={!!datasourceDataset}
        onClose={() => setDatasourceDataset(null)}
        datasetId={datasourceDataset?.id}
        datasetName={datasourceDataset?.name}
        workspaceId={datasourceDataset?.workspaceId}
      />

      <Modal
        open={!!reportsDataset}
        onCancel={() => setReportsDataset(null)}
        footer={null}
        width={720}
        title={`使用该数据集的前端报表 — ${reportsDataset?.name ?? ''}（共 ${boundReports.length} 张）`}
      >
        <Table
          rowKey={(r) => `${r.workspaceId}:${r.id}`}
          size="small"
          dataSource={boundReports}
          pagination={{ pageSize: 10 }}
          columns={[
            { title: '报表', dataIndex: 'name', ellipsis: true },
            { title: '所在工作区', dataIndex: 'workspaceName', width: 180, ellipsis: true },
            {
              title: '操作',
              width: 80,
              render: (_: unknown, r) =>
                r.webUrl ? (
                  <Typography.Link href={r.webUrl} target="_blank">
                    打开 <ExportOutlined />
                  </Typography.Link>
                ) : (
                  '-'
                ),
            },
          ]}
        />
      </Modal>

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
