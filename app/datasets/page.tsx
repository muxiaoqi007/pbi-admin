'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Alert, App, Button, Input, Modal, Space, Table, Tag, Tooltip, Typography } from 'antd'
import { DownloadOutlined, ReloadOutlined, SearchOutlined, SyncOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import ErrorAlert from '@/components/ErrorAlert'
import PageHeader from '@/components/PageHeader'
import RefreshModal from '@/components/RefreshModal'
import StaleDataAlert from '@/components/StaleDataAlert'
import TableEmpty from '@/components/TableEmpty'
import { fetcher, postJSON } from '@/lib/client'
import { exportCSV } from '@/lib/export'
import { useSnapshot } from '@/lib/use-snapshot'
import { useUrlState } from '@/lib/use-url-state'
import type { DatasetView } from '@/lib/types'

const BATCH_LIMIT = 50
const FILTER_DEFAULTS = { q: '', page: '1', size: '20' }

interface BatchResult {
  total: number
  success: number
  failures: { name: string; workspaceId: string; datasetId: string; error: string }[]
}

export default function DatasetsPage() {
  const { message, modal } = App.useApp()
  const { values, setValues } = useUrlState(FILTER_DEFAULTS)
  const keyword = values.q
  const page = Math.max(1, Number(values.page) || 1)
  const pageSize = Math.max(1, Number(values.size) || 20)
  const [refreshDataset, setRefreshDataset] = useState<DatasetView | null>(null)
  const [selected, setSelected] = useState<React.Key[]>([])
  const [batchRunning, setBatchRunning] = useState(false)
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number } | null>(null)
  const [batchResult, setBatchResult] = useState<BatchResult | null>(null)

  useEffect(() => {
    // 兼容旧链接 ?search=；新链接统一使用 ?q=
    const search = new URLSearchParams(window.location.search).get('search')
    if (search && !values.q) setValues({ q: search, page: '1' })
  }, [setValues, values.q])

  const { data, error, isLoading, mutate, isValidating } = useSnapshot()

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

  const filteredRefreshable = useMemo(() => filtered.filter((d) => d.isRefreshable), [filtered])

  function selectAllFiltered() {
    setSelected((previous) =>
      Array.from(new Set([...previous.map(String), ...filteredRefreshable.map((d) => d.id)])),
    )
  }

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

    const chunks: DatasetView[][] = []
    for (let i = 0; i < rows.length; i += BATCH_LIMIT) {
      chunks.push(rows.slice(i, i + BATCH_LIMIT))
    }

    setBatchRunning(true)
    setBatchResult(null)
    const failures: BatchResult['failures'] = []
    let success = 0

    try {
      for (let index = 0; index < chunks.length; index++) {
        const chunk = chunks[index]
        setBatchProgress({ done: index, total: chunks.length })
        try {
          const result = await postJSON<BatchResult>('/api/refresh-batch', {
            items: chunk.map((dataset) => ({
              workspaceId: dataset.workspaceId,
              datasetId: dataset.id,
              name: dataset.name,
            })),
          })
          success += result.success
          failures.push(...result.failures)
        } catch (error) {
          const text = error instanceof Error ? error.message : String(error)
          failures.push(
            ...chunk.map((dataset) => ({
              name: dataset.name,
              workspaceId: dataset.workspaceId,
              datasetId: dataset.id,
              error: text,
            })),
          )
        }
      }

      const result = { total: rows.length, success, failures }
      setBatchResult(result)
      if (failures.length === 0) {
        setSelected([])
        message.success(`${success}/${rows.length} 个数据集刷新请求已提交`)
      } else {
        message.warning(`${success}/${rows.length} 成功，${failures.length} 个失败，详见结果明细`)
      }
    } finally {
      setBatchRunning(false)
      setBatchProgress(null)
    }
  }

  function confirmBatch() {
    const count = selectedDatasets.length
    if (count === 0) return
    const batches = Math.ceil(count / BATCH_LIMIT)
    modal.confirm({
      title: `批量刷新 ${count} 个数据集？`,
      content:
        count > BATCH_LIMIT
          ? `已选 ${count} 个，将自动分 ${batches} 批提交（每批最多 ${BATCH_LIMIT} 个；服务端每批并发 3 个，避免触发限流）。已有刷新排队中的数据集可能被 Power BI 拒绝。`
          : '将依次提交全部刷新请求（服务端并发 3 个，避免触发限流）。已有刷新排队中的数据集可能被 Power BI 拒绝。',
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
          onChange={(e) => setValues({ q: e.target.value, page: '1' })}
        />
        <span className="filter-summary">
          {keyword ? `筛选后 ${filtered.length} / ${data?.datasets.length ?? 0} 个数据集` : `共 ${filtered.length} 个数据集`}
        </span>
        <Button
          onClick={selectAllFiltered}
          disabled={filteredRefreshable.length === 0 || batchRunning}
        >
          全选筛选结果（{filteredRefreshable.length}）
        </Button>
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
          message={`正在提交 ${selectedDatasets.length} 个数据集的刷新请求${
            batchProgress ? `（第 ${batchProgress.done + 1}/${batchProgress.total} 批）` : ''
          }`}
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
          current: page,
          pageSize,
          showSizeChanger: true,
          showTotal: (t) => `共 ${t} 个`,
          onChange: (nextPage, nextSize) =>
            setValues({ page: String(nextPage), size: String(nextSize) }),
        }}
        columns={[
          {
            title: '数据集',
            dataIndex: 'name',
            ellipsis: true,
            render: (value: string, record) => <Link href={`/datasets/${record.id}`}>{value}</Link>,
          },
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
            width: 140,
            fixed: 'right',
            render: (_: unknown, d) => (
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

      {batchResult && batchResult.failures.length > 0 && (
        <Modal
          open
          footer={
            <Space>
              <Button onClick={() => setBatchResult(null)}>关闭</Button>
              <Button
                type="primary"
                onClick={() => {
                  const failedIds = Array.from(
                    new Set(batchResult.failures.map((failure) => failure.datasetId)),
                  )
                  setSelected(failedIds)
                  setBatchResult(null)
                  message.info(`已选中 ${failedIds.length} 个失败数据集，可直接重试`)
                }}
              >
                仅选中失败项（{batchResult.failures.length}）
              </Button>
            </Space>
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
              <li key={`${f.datasetId}-${index}`} style={{ marginBottom: 8 }}>
                <Typography.Text strong>{f.name}</Typography.Text>
                <div className="text-error" style={{ fontSize: 12, wordBreak: 'break-all' }}>{f.error}</div>
              </li>
            ))}
          </ul>
        </Modal>
      )}

      <RefreshModal
        open={!!refreshDataset}
        dataset={refreshDataset}
        onClose={() => setRefreshDataset(null)}
      />
    </div>
  )
}
