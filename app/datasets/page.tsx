'use client'

import { useMemo, useState } from 'react'
import { Alert, App, Button, Drawer, Dropdown, Input, Modal, Space, Table, Tag, Tooltip, Typography } from 'antd'
import { DownloadOutlined, ExportOutlined, MoreOutlined, ReloadOutlined, SearchOutlined, SyncOutlined } from '@ant-design/icons'
import useSWR from 'swr'
import dayjs from 'dayjs'
import DatasourcesModal from '@/components/DatasourcesModal'
import ErrorAlert from '@/components/ErrorAlert'
import RefreshHistoryDrawer from '@/components/RefreshHistoryDrawer'
import RefreshModal from '@/components/RefreshModal'
import SchemaDrawer from '@/components/SchemaDrawer'
import StaleDataAlert from '@/components/StaleDataAlert'
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
  const [pageSize, setPageSize] = useState(20)
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

  const selectedDatasets = useMemo(() => {
    const ids = new Set(selected.map(String))
    return (data?.datasets ?? []).filter((d) => ids.has(d.id) && d.isRefreshable)
  }, [data, selected])

  const selectedVisibleCount = useMemo(() => {
    const ids = new Set(selectedDatasets.map((d) => d.id))
    return filtered.filter((d) => ids.has(d.id)).length
  }, [filtered, selectedDatasets])

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
    const rows = selectedDatasets
    if (rows.length === 0) return
    setBatchRunning(true)
    setBatchResult(null)
    try {
      const res = await postJSON<BatchResult>('/api/refresh-batch', {
        items: rows.map((d) => ({ workspaceId: d.workspaceId, datasetId: d.id, name: d.name })),
      })
      setBatchResult(res)
      if (res.failures.length === 0) {
        setSelected([])
        message.success(`${res.success}/${res.total} 个数据集刷新请求已提交`)
      } else {
        message.warning(`${res.success}/${res.total} 成功，${res.failures.length} 个失败，详见结果明细`)
      }
    } catch (e) {
      message.error(e instanceof Error ? e.message : String(e))
    } finally {
      setBatchRunning(false)
    }
  }

  function confirmBatch() {
    const count = selectedDatasets.length
    if (count === 0) return
    modal.confirm({
      title: `批量刷新 ${count} 个数据集？`,
      content:
        '将依次对所选数据集触发全部刷新（并发 3 个，避免触发限流）。已有刷新排队中的数据集会被服务端拒绝，失败明细将在完成后展示。',
      okText: '开始刷新',
      cancelText: '取消',
      okButtonProps: { loading: batchRunning },
      onOk: runBatchRefresh,
    })
  }

  return (
    <div>
      {error && !data && <ErrorAlert error={error} onRetry={() => mutate()} />}
      {error && data && <StaleDataAlert error={error} onRetry={() => mutate()} />}
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
        {selectedDatasets.length > 0 && selectedVisibleCount !== selectedDatasets.length && (
          <Tag color="blue">已选 {selectedDatasets.length} 个，其中当前筛选可见 {selectedVisibleCount} 个</Tag>
        )}
        <Button
          icon={<ReloadOutlined />}
          loading={isValidating}
          onClick={() => mutate(() => fetcher('/api/snapshot?force=1'))}
        >
          刷新列表
        </Button>
        <Button icon={<DownloadOutlined />} onClick={doExport} disabled={!data}>
          导出 CSV
        </Button>
        <Button
          type="primary"
          ghost
          icon={<SyncOutlined />}
          disabled={selectedDatasets.length === 0}
          loading={batchRunning}
          onClick={confirmBatch}
        >
          批量刷新{selectedDatasets.length > 0 ? `（已选 ${selectedDatasets.length} 个）` : ''}
        </Button>
        {selectedDatasets.length > 0 && (
          <Button size="small" type="link" onClick={() => setSelected([])} disabled={batchRunning}>
            清空选择
          </Button>
        )}
      </div>
      <Table<DatasetView>
        rowKey="id"
        loading={isLoading}
        dataSource={filtered}
        scroll={{ x: 1050 }}
        rowSelection={{
          selectedRowKeys: selected,
          onChange: setSelected,
          preserveSelectedRowKeys: true,
          getCheckboxProps: (d) => ({ disabled: !d.isRefreshable }),
        }}
        pagination={{ pageSize, showSizeChanger: true, showTotal: (t) => `共 ${t} 个`, onShowSizeChange: (_, size) => setPageSize(size) }}
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
            width: 190,
            fixed: 'right',
            render: (_: unknown, d) => (
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
          <Alert
            type="warning"
            showIcon
            message={`${batchResult.failures.length} 个数据集未能提交刷新`}
            description="可以根据下方错误修复后重新选择这些数据集再试。"
            style={{ marginBottom: 12 }}
          />
          <ul style={{ margin: 0, paddingLeft: 18, maxHeight: 420, overflow: 'auto' }}>
            {batchResult.failures.map((f, index) => (
              <li key={`${f.name}-${index}`} style={{ marginBottom: 8 }}>
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
        onTriggered={() => {
          if (refreshDataset) setHistoryDataset(refreshDataset)
        }}
      />
    </div>
  )
}
