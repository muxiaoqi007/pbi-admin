'use client'

import { useMemo, useState } from 'react'
import { Alert, App, Button, Drawer, Dropdown, Input, Modal, Space, Table, Tag, Tooltip, Typography } from 'antd'
import { DownloadOutlined, ExportOutlined, MoreOutlined, ReloadOutlined, SearchOutlined, SyncOutlined } from '@ant-design/icons'
import useSWR from 'swr'
import dayjs from 'dayjs'
import DatasourcesModal from '@/components/DatasourcesModal'
import ErrorAlert from '@/components/ErrorAlert'
import PageHeader from '@/components/PageHeader'
import RefreshHistoryDrawer from '@/components/RefreshHistoryDrawer'
import RefreshModal from '@/components/RefreshModal'
import SchemaDrawer from '@/components/SchemaDrawer'
import StaleDataAlert from '@/components/StaleDataAlert'
import TableEmpty from '@/components/TableEmpty'
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

  const refreshableCount = useMemo(
    () => (data?.datasets ?? []).filter((d) => d.isRefreshable).length,
    [data],
  )

  const { data: usersData, error: usersError, isLoading: usersLoading } = useSWR<{
    users: PbiAdminUser[]
  }>(usersDataset ? `/api/datasets/users?wid=${usersDataset.workspaceId}&did=${usersDataset.id}` : null, fetcher)

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
        '将依次提交全部刷新请求（服务端并发 3 个，避免触发限流）。已有刷新排队中的数据集可能被 Power BI 拒绝。',
      okText: '开始提交',
      cancelText: '取消',
      okButtonProps: { loading: batchRunning },
      onOk: runBatchRefresh,
    })
  }

  return (
    <div>
      <PageHeader
        title="数据集"
        description="管理语义模型刷新、结构、数据源、用户与关联报表。批量操作仅对当前可刷新的数据集生效。"
        meta={
          data
            ? `数据快照：${dayjs(data.fetchedAt).format('YYYY-MM-DD HH:mm:ss')} · 可刷新 ${refreshableCount} / ${data.datasets.length}`
            : undefined
        }
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
          placeholder="搜索数据集名称 / 工作区"
          style={{ width: 340, maxWidth: '100%' }}
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
        <span className="filter-summary">
          {keyword ? `筛选后 ${filtered.length} / ${data?.datasets.length ?? 0} 个数据集` : `共 ${filtered.length} 个数据集`}
        </span>
      </div>

      {selectedDatasets.length > 0 && (
        <div className="selection-bar">
          <div>
            <Typography.Text strong>已选择 {selectedDatasets.length} 个可刷新数据集</Typography.Text>
            {selectedVisibleCount !== selectedDatasets.length && (
              <span className="text-muted"> · 当前筛选可见 {selectedVisibleCount} 个</span>
            )}
          </div>
          <Space wrap>
            <Button onClick={() => setSelected([])} disabled={batchRunning}>清空选择</Button>
            <Button
              type="primary"
              icon={<SyncOutlined spin={batchRunning} />}
              disabled={selectedDatasets.length === 0}
              loading={batchRunning}
              onClick={confirmBatch}
            >
              {batchRunning ? '正在提交刷新请求' : '批量刷新'}
            </Button>
          </Space>
        </div>
      )}

      {batchRunning && (
        <Alert
          type="info"
          showIcon
          message={`正在提交 ${selectedDatasets.length} 个数据集的刷新请求`}
          description="这是请求提交阶段，不代表 Power BI 已完成刷新。提交完成后可在各数据集的刷新记录中继续查看执行状态。"
          style={{ marginBottom: 12 }}
        />
      )}

      {batchResult && batchResult.failures.length === 0 && (
        <Alert
          type="success"
          showIcon
          closable
          onClose={() => setBatchResult(null)}
          message={`批量提交完成：${batchResult.success} / ${batchResult.total} 成功`}
          description="刷新任务已经提交到 Power BI；实际处理状态请在数据集的刷新记录中查看。"
          style={{ marginBottom: 12 }}
        />
      )}

      <Table<DatasetView>
        rowKey="id"
        loading={isLoading}
        dataSource={filtered}
        scroll={{ x: 1050 }}
        locale={{
          emptyText: (
            <TableEmpty
              title={keyword ? '没有匹配的数据集' : '暂无数据集'}
              description={keyword ? '尝试调整数据集或工作区关键词。' : '当前环境没有可显示的数据集。'}
            />
          ),
        }}
        rowSelection={{
          selectedRowKeys: selected,
          onChange: setSelected,
          preserveSelectedRowKeys: true,
          getCheckboxProps: (d) => ({ disabled: !d.isRefreshable }),
        }}
        pagination={{
          pageSize,
          showSizeChanger: true,
          showTotal: (t) => `共 ${t} 个`,
          onShowSizeChange: (_, size) => setPageSize(size),
        }}
        columns={[
          { title: '数据集', dataIndex: 'name', ellipsis: true },
          { title: '工作区', dataIndex: 'workspaceName', width: 150, ellipsis: true },
          {
            title: '刷新能力',
            dataIndex: 'isRefreshable',
            width: 90,
            render: (v?: boolean) => (v ? <Tag color="green">可刷新</Tag> : <Tag>不可刷新</Tag>),
          },
          {
            title: '连接',
            dataIndex: 'isOnPremGatewayRequired',
            width: 90,
            render: (v?: boolean) => (v ? <Tag color="orange">本地网关</Tag> : <Tag color="blue">云端</Tag>),
          },
          { title: '关联报表', dataIndex: 'reportCount', width: 85 },
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
            render: (v?: string) => (v ? dayjs(v).format('YYYY-MM-DD HH:mm') : <span className="text-muted">未知</span>),
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
                  <a onClick={(e) => e.preventDefault()}><MoreOutlined /> 更多</a>
                </Dropdown>
              </Space>
            ),
          },
        ]}
      />

      {batchResult && batchResult.failures.length > 0 && (
        <Modal
          open
          footer={<Button type="primary" onClick={() => setBatchResult(null)}>知道了</Button>}
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
                <div className="text-error" style={{ fontSize: 12, wordBreak: 'break-all' }}>{f.error}</div>
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
          locale={{ emptyText: <TableEmpty title="暂无关联报表" /> }}
          columns={[
            { title: '报表', dataIndex: 'name', ellipsis: true },
            { title: '所在工作区', dataIndex: 'workspaceName', width: 180, ellipsis: true },
            {
              title: '操作',
              width: 80,
              render: (_: unknown, r) =>
                r.webUrl ? (
                  <Typography.Link href={r.webUrl} target="_blank">打开 <ExportOutlined /></Typography.Link>
                ) : <span className="text-muted">无链接</span>,
            },
          ]}
        />
      </Modal>

      <RefreshHistoryDrawer open={!!historyDataset} dataset={historyDataset} onClose={() => setHistoryDataset(null)} />
      <Drawer
        open={!!usersDataset}
        onClose={() => setUsersDataset(null)}
        width={680}
        title={`数据集用户 — ${usersDataset?.name ?? ''}`}
      >
        {usersError && <ErrorAlert error={usersError} />}
        <UsersTable users={usersData?.users ?? []} loading={usersLoading} />
      </Drawer>
      <SchemaDrawer open={!!schemaDataset} dataset={schemaDataset} onClose={() => setSchemaDataset(null)} />
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
