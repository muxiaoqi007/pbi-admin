'use client'

import { useMemo, useState } from 'react'
import { App, Button, Drawer, Dropdown, Input, Modal, Space, Table, Tag, Typography } from 'antd'
import { DownloadOutlined, ExportOutlined, MoreOutlined, SearchOutlined, SyncOutlined } from '@ant-design/icons'
import useSWR from 'swr'
import dayjs from 'dayjs'
import DatasourcesModal from '@/components/DatasourcesModal'
import ErrorAlert from '@/components/ErrorAlert'
import RefreshHistoryDrawer from '@/components/RefreshHistoryDrawer'
import RefreshModal from '@/components/RefreshModal'
import SchemaDrawer from '@/components/SchemaDrawer'
import UsersTable from '@/components/UsersTable'
import { fetcher, postJSON } from '@/lib/client'
import { exportCSV } from '@/lib/export'
import type { DatasetView, PbiAdminUser, TenantSnapshot } from '@/lib/types'

interface BatchResult {
  total: number
  success: number
  failures: { name: string; error: string }[]
}

export default function DatasetsPage() {
  const { message, modal } = App.useApp()
  const [keyword, setKeyword] = useState('')
  const [datasourceDataset, setDatasourceDataset] = useState<DatasetView | null>(null)
  const [reportsDataset, setReportsDataset] = useState<DatasetView | null>(null)
  const [historyDataset, setHistoryDataset] = useState<DatasetView | null>(null)
  const [refreshDataset, setRefreshDataset] = useState<DatasetView | null>(null)
  const [usersDataset, setUsersDataset] = useState<DatasetView | null>(null)
  const [schemaDataset, setSchemaDataset] = useState<DatasetView | null>(null)
  const [selected, setSelected] = useState<React.Key[]>([])
  const [batchRunning, setBatchRunning] = useState(false)
  const [batchResult, setBatchResult] = useState<BatchResult | null>(null)

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

  const { data: usersData, error: usersError, isLoading: usersLoading } = useSWR<{
    users: PbiAdminUser[]
  }>(
    usersDataset ? `/api/datasets/users?wid=${usersDataset.workspaceId}&did=${usersDataset.id}` : null,
    fetcher,
  )

  const boundReports = useMemo(
    () => (data?.reports ?? []).filter((r) => r.datasetId === reportsDataset?.id),
    [data, reportsDataset],
  )

  function doExport() {
    exportCSV(
      `数据集清单_${new Date().toISOString().slice(0, 10)}.csv`,
      ['数据集', '工作区', '可刷新', '需要网关', '关联报表数', '配置者', '修改时间', 'ID'],
      filtered.map((d) => [
        d.name,
        d.workspaceName,
        d.isRefreshable ? '是' : '否',
        d.isOnPremGatewayRequired ? '是' : '否',
        d.reportCount,
        d.configuredBy ?? '',
        d.modifiedDate ? dayjs(d.modifiedDate).format('YYYY-MM-DD HH:mm') : '',
        d.id,
      ]),
    )
  }

  async function runBatchRefresh() {
    const rows = filtered.filter((d) => selected.includes(d.id))
    if (rows.length === 0) return
    setBatchRunning(true)
    setBatchResult(null)
    try {
      const res = await postJSON<BatchResult>('/api/refresh-batch', {
        items: rows.map((d) => ({ workspaceId: d.workspaceId, datasetId: d.id, name: d.name })),
      })
      setBatchResult(res)
      if (res.failures.length === 0) {
        message.success(`${res.success}/${res.total} 个数据集刷新请求已提交`)
      } else {
        message.warning(`${res.success}/${res.total} 成功，${res.failures.length} 个失败，详见页面下方明细`)
      }
    } catch (e) {
      message.error(e instanceof Error ? e.message : String(e))
    } finally {
      setBatchRunning(false)
    }
  }

  function confirmBatch() {
    modal.confirm({
      title: `批量刷新 ${selected.length} 个数据集？`,
      content:
        '将依次对所选数据集触发全部刷新（并发 3 个，避免触发限流）。已有刷新排队中的数据集会被服务端拒绝，失败明细将在完成后展示。',
      okText: '开始刷新',
      onOk: runBatchRefresh,
    })
  }

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
        <Button icon={<DownloadOutlined />} onClick={doExport} disabled={!data}>
          导出 CSV
        </Button>
        <Button
          type="primary"
          ghost
          icon={<SyncOutlined />}
          disabled={selected.length === 0}
          loading={batchRunning}
          onClick={confirmBatch}
        >
          批量刷新{selected.length > 0 ? `（已选 ${selected.length} 个）` : ''}
        </Button>
      </div>
      <Table<DatasetView>
        rowKey="id"
        loading={isLoading}
        dataSource={filtered}
        rowSelection={{
          selectedRowKeys: selected,
          onChange: setSelected,
          getCheckboxProps: (d) => ({ disabled: !d.isRefreshable }),
        }}
        pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `共 ${t} 个` }}
        columns={[
          { title: '数据集', dataIndex: 'name', ellipsis: true },
          { title: '工作区', dataIndex: 'workspaceName', width: 150, ellipsis: true },
          {
            title: '可刷新',
            dataIndex: 'isRefreshable',
            width: 75,
            render: (v?: boolean) => (v ? <Tag color="green">是</Tag> : '-'),
          },
          {
            title: '网关',
            dataIndex: 'isOnPremGatewayRequired',
            width: 70,
            render: (v?: boolean) => (v ? <Tag color="orange">本地</Tag> : '云'),
          },
          { title: '关联报表', dataIndex: 'reportCount', width: 85 },
          {
            title: '配置者',
            dataIndex: 'configuredBy',
            width: 150,
            ellipsis: true,
            render: (v?: string) => v ?? '-',
          },
          {
            title: '修改时间',
            dataIndex: 'modifiedDate',
            width: 130,
            render: (v?: string) => (v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '-'),
          },
          {
            title: '操作',
            width: 170,
            fixed: 'right',
            render: (_: unknown, d) => (
              <Space size={4}>
                <a onClick={() => setRefreshDataset(d)}>立即刷新</a>
                <Dropdown
                  trigger={['click']}
                  menu={{
                    items: [
                      { key: 'users', label: '用户', onClick: () => setUsersDataset(d) },
                      { key: 'schema', label: '结构', onClick: () => setSchemaDataset(d) },
                      { key: 'datasources', label: '数据源', onClick: () => setDatasourceDataset(d) },
                      { key: 'reports', label: '关联报表', onClick: () => setReportsDataset(d) },
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

      {batchResult && batchResult.failures.length > 0 && (
        <Modal
          open
          footer={
            <Button type="primary" onClick={() => setBatchResult(null)}>
              知道了
            </Button>
          }
          onCancel={() => setBatchResult(null)}
          title={`批量刷新结果：成功 ${batchResult.success} / ${batchResult.total}`}
        >
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {batchResult.failures.map((f, index) => (
              <li key={`${f.name}-${index}`} style={{ marginBottom: 4 }}>
                <Typography.Text strong>{f.name}</Typography.Text>
                <div className="text-error" style={{ fontSize: 12, wordBreak: 'break-all' }}>
                  {f.error}
                </div>
              </li>
            ))}
          </ul>
        </Modal>
      )}

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
      <RefreshModal
        open={!!refreshDataset}
        dataset={refreshDataset}
        onClose={() => setRefreshDataset(null)}
        onTriggered={() => setHistoryDataset(refreshDataset)}
      />
    </div>
  )
}
