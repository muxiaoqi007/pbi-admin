'use client'

import { useMemo, useState } from 'react'
import { Drawer, Input, Space, Table, Typography } from 'antd'
import { ExportOutlined, SearchOutlined } from '@ant-design/icons'
import useSWR from 'swr'
import dayjs from 'dayjs'
import DatasourcesModal from '@/components/DatasourcesModal'
import ErrorAlert from '@/components/ErrorAlert'
import UsersTable from '@/components/UsersTable'
import { fetcher } from '@/lib/client'
import type { PbiAdminUser, ReportView, TenantSnapshot } from '@/lib/types'

export default function ReportsPage() {
  const [keyword, setKeyword] = useState('')
  const [usersReport, setUsersReport] = useState<ReportView | null>(null)
  const [datasourceReport, setDatasourceReport] = useState<ReportView | null>(null)

  const { data, error, isLoading, mutate, isValidating } = useSWR<TenantSnapshot>(
    '/api/snapshot',
    fetcher,
    { keepPreviousData: true },
  )

  const datasetNameById = useMemo(() => {
    const m = new Map<string, string>()
    for (const d of data?.datasets ?? []) m.set(d.id, d.name)
    return m
  }, [data])

  const filtered = useMemo(() => {
    const k = keyword.trim().toLowerCase()
    if (!k) return data?.reports ?? []
    return (data?.reports ?? []).filter(
      (r) =>
        r.name.toLowerCase().includes(k) ||
        r.workspaceName.toLowerCase().includes(k) ||
        (r.datasetId ? datasetNameById.get(r.datasetId)?.toLowerCase().includes(k) : false),
    )
  }, [data, keyword, datasetNameById])

  const { data: usersData, error: usersError, isLoading: usersLoading } = useSWR<{
    users: PbiAdminUser[]
  }>(usersReport ? `/api/reports/${usersReport.id}/users` : null, fetcher)

  const datasourceDataset = useMemo(
    () => data?.datasets.find((d) => d.id === datasourceReport?.datasetId),
    [data, datasourceReport],
  )

  return (
    <div>
      {error && !data && <ErrorAlert error={error} onRetry={() => mutate()} />}
      <div className="table-toolbar">
        <Input
          allowClear
          prefix={<SearchOutlined />}
          placeholder="搜索报表名称 / 工作区 / 数据集"
          style={{ width: 320 }}
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
        <span className="text-muted">共 {filtered.length} 张报表</span>
        {isValidating && data && <span className="text-muted">（正在刷新…）</span>}
      </div>
      <Table<ReportView>
        rowKey={(r) => `${r.workspaceId}:${r.id}`}
        loading={isLoading}
        dataSource={filtered}
        pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `共 ${t} 张` }}
        columns={[
          { title: '报表', dataIndex: 'name', ellipsis: true },
          { title: '工作区', dataIndex: 'workspaceName', width: 180, ellipsis: true },
          {
            title: '数据集',
            dataIndex: 'datasetId',
            width: 180,
            ellipsis: true,
            render: (v?: string) => (v ? datasetNameById.get(v) ?? v : <span className="text-muted">无</span>),
          },
          {
            title: '修改时间',
            dataIndex: 'modifiedDateTime',
            width: 160,
            render: (v?: string) => (v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '-'),
          },
          {
            title: '操作',
            width: 220,
            render: (_: unknown, r) => (
              <Space size={12}>
                <a onClick={() => setUsersReport(r)}>用户</a>
                <a onClick={() => setDatasourceReport(r)}>数据源</a>
                {r.webUrl && (
                  <Typography.Link href={r.webUrl} target="_blank">
                    <Space size={2}>
                      打开 <ExportOutlined />
                    </Space>
                  </Typography.Link>
                )}
              </Space>
            ),
          },
        ]}
      />

      <Drawer
        open={!!usersReport}
        onClose={() => setUsersReport(null)}
        width={680}
        title={`报表用户 — ${usersReport?.name ?? ''}`}
      >
        {usersError && <ErrorAlert error={usersError} />}
        <UsersTable users={usersData?.users ?? []} loading={usersLoading} />
      </Drawer>

      <DatasourcesModal
        open={!!datasourceReport}
        onClose={() => setDatasourceReport(null)}
        datasetId={datasourceReport?.datasetId}
        datasetName={datasourceDataset?.name ?? datasourceReport?.datasetId ?? '（报表未绑定数据集）'}
        workspaceId={datasourceDataset?.workspaceId ?? datasourceReport?.workspaceId}
      />
    </div>
  )
}
