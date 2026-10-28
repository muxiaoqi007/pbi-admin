'use client'

import { useMemo } from 'react'
import { Alert, Button, Card, Col, Input, Row, Select, Space, Statistic, Table, Tag, Typography } from 'antd'
import { ReloadOutlined, SearchOutlined, SyncOutlined, WarningOutlined } from '@ant-design/icons'
import useSWR from 'swr'
import dayjs from 'dayjs'
import ErrorAlert from '@/components/ErrorAlert'
import ErrorText from '@/components/ErrorText'
import PageHeader from '@/components/PageHeader'
import RefreshFailureTable from '@/components/RefreshFailureTable'
import StaleDataAlert from '@/components/StaleDataAlert'
import TableEmpty from '@/components/TableEmpty'
import { fetcher } from '@/lib/client'
import { useSnapshot } from '@/lib/use-snapshot'
import { useUrlState } from '@/lib/use-url-state'
import { formatDateTimeSeconds, parseRefreshError } from '@/lib/domain/format'
import { refreshStatusMeta } from '@/lib/domain/labels'
import type { PbiRefreshable, RefreshFailureScan } from '@/lib/types'

const FILTER_DEFAULTS = { q: '', status: '', page: '1', size: '20' }

function durationLabel(start?: string, end?: string) {
  if (!start) return '-'
  const finish = end ? dayjs(end) : dayjs()
  const seconds = Math.max(0, finish.diff(dayjs(start), 'second'))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return `${minutes}m ${rest}s`
}

export default function RefreshesPage() {
  const { values, setValues } = useUrlState(FILTER_DEFAULTS)
  const keyword = values.q
  const statusFilter = values.status || undefined
  const page = Math.max(1, Number(values.page) || 1)
  const pageSize = Math.max(1, Number(values.size) || 20)

  const {
    data: snapshot,
    error: snapshotError,
    isLoading: snapshotLoading,
    mutate: mutateSnapshot,
  } = useSnapshot()

  const adminMode = snapshot?.mode === 'admin'
  const {
    data: refreshData,
    error: refreshError,
    isLoading: refreshLoading,
    isValidating,
    mutate: mutateRefreshes,
  } = useSWR<{ refreshables: PbiRefreshable[] }>(adminMode ? '/api/refreshables' : null, fetcher, {
    refreshInterval: 30_000,
    revalidateOnFocus: false,
  })

  const {
    data: failureData,
    error: failureError,
    isLoading: failureLoading,
    isValidating: failureValidating,
    mutate: mutateFailures,
  } = useSWR<RefreshFailureScan>(snapshot ? '/api/refresh-failures' : null, fetcher, {
    revalidateOnFocus: false,
  })
  const failures = useMemo(() => failureData?.failures ?? [], [failureData])
  const failurePartial = Boolean(failureData?.partial)
  const filteredFailures = useMemo(() => {
    const k = keyword.trim().toLowerCase()
    if (!k) return failures
    return failures.filter(
      (failure) =>
        failure.datasetName.toLowerCase().includes(k) ||
        failure.workspaceName.toLowerCase().includes(k) ||
        (failure.error ?? '').toLowerCase().includes(k),
    )
  }, [failures, keyword])

  async function refreshAll() {
    const tasks: Promise<unknown>[] = [mutateFailures(() => fetcher('/api/refresh-failures?force=1'))]
    if (adminMode) tasks.push(mutateRefreshes())
    await Promise.all(tasks)
  }

  const refreshables = useMemo(() => refreshData?.refreshables ?? [], [refreshData])
  const datasetById = useMemo(
    () => new Map((snapshot?.datasets ?? []).map((dataset) => [dataset.id, dataset])),
    [snapshot],
  )

  const rows = useMemo(
    () =>
      refreshables.map((item, index) => {
        const itemId = item.itemId ?? item.id ?? ''
        const dataset = itemId ? datasetById.get(itemId) : undefined
        return {
          ...item,
          rowKey: itemId || `${item.name ?? 'refreshable'}-${index}`,
          resolvedName: item.name || dataset?.name || itemId || '未命名刷新项',
          workspaceName: dataset?.workspaceName,
          resolvedStatus: item.lastRefresh?.status ?? '',
        }
      }),
    [refreshables, datasetById],
  )

  const filtered = useMemo(() => {
    const k = keyword.trim().toLowerCase()
    return rows.filter((row) => {
      if (statusFilter && row.resolvedStatus !== statusFilter) return false
      if (!k) return true
      return (
        row.resolvedName.toLowerCase().includes(k) ||
        (row.workspaceName ?? '').toLowerCase().includes(k) ||
        (row.kind ?? '').toLowerCase().includes(k)
      )
    })
  }, [rows, keyword, statusFilter])

  const counts = useMemo(() => {
    const result = { completed: 0, failed: 0, active: 0, queued: 0, unknown: 0 }
    for (const item of refreshables) {
      const status = item.lastRefresh?.status
      if (status === 'Completed') result.completed++
      else if (status === 'Failed') result.failed++
      else if (status === 'InProgress') result.active++
      else if (status === 'NotStarted') result.queued++
      else result.unknown++
    }
    return result
  }, [refreshables])

  const lastUpdated = refreshables
    .map((item) => item.lastRefresh?.startTime)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1)

  return (
    <div>
      <PageHeader
        title="刷新监控"
        description={
          adminMode
            ? '查看租户内可刷新项的最近刷新状态、执行时间、历史耗时统计和失败信息。页面每 30 秒自动检查一次最新状态。'
            : '查看当前身份可见数据集的刷新失败巡检结果；全租户运行状态与历史耗时统计需要 Admin API。'
        }
        meta={
          <Space size={6} wrap>
            <Tag color={adminMode ? 'green' : 'orange'}>{adminMode ? 'Admin 模式' : '成员模式'}</Tag>
            {lastUpdated && <Tag>最近任务：{dayjs(lastUpdated).format('YYYY-MM-DD HH:mm:ss')}</Tag>}
            {isValidating && <Tag color="processing">正在同步状态</Tag>}
          </Space>
        }
        actions={
          <Button icon={<ReloadOutlined />} loading={isValidating || failureValidating} onClick={refreshAll} disabled={!snapshot}>
            刷新状态
          </Button>
        }
      />

      {snapshotError && !snapshot && <ErrorAlert error={snapshotError} onRetry={() => mutateSnapshot()} />}
      {snapshotError && snapshot && <StaleDataAlert error={snapshotError} onRetry={() => mutateSnapshot()} />}

      {failurePartial && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message={`刷新巡检未完成：已检查 ${failureData?.scanned ?? 0}/${failureData?.attempted ?? 0} 个可刷新数据集`}
          description={
            <>
              失败 {failures.length} 个，未检查 {failureData?.skipped ?? 0} 个
              {failureData?.rateLimited
                ? `（Power BI 限流${failureData.retryAfterSeconds ? `，约 ${Math.ceil(failureData.retryAfterSeconds / 60)} 分钟后可重试` : ''}）`
                : '（取数失败）'}
              。当前失败数可能偏低，请稍后重新巡检。
            </>
          }
        />
      )}

      {failureData && (failureData.noHistory ?? 0) > 0 && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message={`${failureData.noHistory} 个可刷新数据集没有任何刷新记录`}
          description="这些数据集无法判断最近一次刷新是否成功；请确认是否遗漏了刷新计划。"
        />
      )}

      {snapshot && snapshot.mode === 'member' && (
        <Alert
          type="warning"
          showIcon
          message="成员模式下无法获取全租户刷新状态"
          description="刷新监控依赖 Power BI 租户 Admin API 的 refreshables 能力。成员模式仍可在单个数据集的“刷新记录”中查看当前身份可访问的数据集。"
        />
      )}

      {adminMode && refreshError && (
        <ErrorAlert error={refreshError} onRetry={() => mutateRefreshes()} />
      )}

      {adminMode && !refreshError && (
        <>
          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            <Col xs={12} md={6}>
              <Card className="metric-card">
                <Statistic
                  title="进行中 / 排队"
                  value={counts.active + counts.queued}
                  loading={refreshLoading && !refreshData}
                  prefix={<SyncOutlined spin={counts.active > 0} />}
                />
                <div className="metric-hint">进行中 {counts.active} · 排队 {counts.queued}</div>
              </Card>
            </Col>
            <Col xs={12} md={6}>
              <Card className="metric-card">
                <Statistic
                  title="最近成功"
                  value={counts.completed}
                  loading={refreshLoading && !refreshData}
                />
                <div className="metric-hint">最近一次刷新状态为成功</div>
              </Card>
            </Col>
            <Col xs={12} md={6}>
              <Card className="metric-card">
                <Statistic
                  title="最近失败"
                  value={counts.failed}
                  loading={refreshLoading && !refreshData}
                  prefix={counts.failed > 0 ? <WarningOutlined /> : undefined}
                  valueStyle={counts.failed > 0 ? { color: '#cf1322' } : undefined}
                />
                <div className="metric-hint">需要优先排查的刷新项</div>
              </Card>
            </Col>
            <Col xs={12} md={6}>
              <Card className="metric-card">
                <Statistic
                  title="可监控项"
                  value={refreshables.length}
                  loading={refreshLoading && !refreshData}
                />
                <div className="metric-hint">其他 / 未知状态 {counts.unknown}</div>
              </Card>
            </Col>
          </Row>

          <div className="filter-bar">
            <Input
              allowClear
              prefix={<SearchOutlined />}
              placeholder="搜索刷新项 / 工作区 / 类型"
              value={keyword}
              onChange={(event) => setValues({ q: event.target.value, page: '1' })}
              style={{ width: 320 }}
            />
            <Select
              allowClear
              placeholder="按最近状态筛选"
              value={statusFilter}
              onChange={(value) => setValues({ status: value ?? '', page: '1' })}
              style={{ width: 180 }}
              options={[
                { value: 'InProgress', label: '进行中' },
                { value: 'NotStarted', label: '排队中' },
                { value: 'Failed', label: '失败' },
                { value: 'Completed', label: '成功' },
                { value: 'Unknown', label: '未知' },
              ]}
            />
            <span className="filter-summary">
              {refreshLoading && !refreshData
                ? '正在加载刷新状态…'
                : `显示 ${filtered.length} / ${rows.length} 个刷新项`}
            </span>
          </div>

          <Card className="section-card" title="刷新状态清单">
            <Table
              rowKey="rowKey"
              size="small"
              loading={(snapshotLoading || refreshLoading) && !refreshData}
              dataSource={filtered}
              locale={{
                emptyText: (
                  <TableEmpty
                    title={keyword || statusFilter ? '没有匹配的刷新项' : '暂无刷新状态'}
                    description={keyword || statusFilter ? '调整搜索或状态筛选后再试。' : 'Power BI 尚未返回可刷新的租户项目。'}
                  />
                ),
              }}
              scroll={{ x: 1100 }}
              pagination={{
                current: page,
                pageSize,
                showSizeChanger: true,
                showTotal: (total) => `共 ${total} 个`,
                onChange: (nextPage, nextSize) =>
                  setValues({ page: String(nextPage), size: String(nextSize) }),
              }}
              columns={[
                { title: '刷新项', dataIndex: 'resolvedName', ellipsis: true },
                {
                  title: '工作区',
                  dataIndex: 'workspaceName',
                  width: 180,
                  ellipsis: true,
                  render: (value?: string) => value ?? <Typography.Text type="secondary">未解析</Typography.Text>,
                },
                { title: '类型', dataIndex: 'kind', width: 110, render: (value?: string) => value ?? '-' },
                {
                  title: '最近状态',
                  dataIndex: 'resolvedStatus',
                  width: 100,
                  render: (status?: string) => {
                    const meta = refreshStatusMeta(status)
                    return <Tag color={meta.color}>{meta.label}</Tag>
                  },
                },
                {
                  title: '开始时间',
                  dataIndex: ['lastRefresh', 'startTime'],
                  width: 165,
                  render: (value?: string) => formatDateTimeSeconds(value),
                },
                {
                  title: '本次耗时',
                  width: 100,
                  render: (_: unknown, row) => durationLabel(row.lastRefresh?.startTime, row.lastRefresh?.endTime),
                },
                {
                  title: '历史刷新次数',
                  dataIndex: 'refreshCount',
                  width: 110,
                  sorter: (a, b) => (a.refreshCount ?? 0) - (b.refreshCount ?? 0),
                  render: (value?: number) => value ?? '-',
                },
                {
                  title: '平均耗时',
                  dataIndex: 'meanDuration',
                  width: 100,
                  render: (value?: number) => (typeof value === 'number' ? `${Math.round(value)}s` : '-'),
                },
                {
                  title: '错误',
                  width: 220,
                  ellipsis: { showTitle: false },
                  render: (_: unknown, row) => (
                    <ErrorText text={parseRefreshError(row.lastRefresh?.serviceExceptionJson)} />
                  ),
                },
              ]}
            />
          </Card>
        </>
      )}

      {snapshot && (!adminMode || refreshError) && (
        <>
          {failureError && <ErrorAlert error={failureError} onRetry={() => mutateFailures()} />}
          <Card className="section-card" title="刷新失败巡检">
            <div className="filter-bar">
              <Input
                allowClear
                prefix={<SearchOutlined />}
                placeholder="搜索失败数据集 / 工作区 / 错误"
                value={keyword}
                onChange={(event) => setValues({ q: event.target.value, page: '1' })}
                style={{ width: 340, maxWidth: '100%' }}
              />
              <span className="filter-summary">
                {failureLoading && !failureData
                  ? '正在巡检刷新状态…'
                  : `显示 ${filteredFailures.length} / ${failures.length} 项`}
              </span>
            </div>
            <RefreshFailureTable
              failures={filteredFailures}
              loading={failureLoading}
              partial={failurePartial}
              noHistory={failureData?.noHistory ?? 0}
              filtered={Boolean(keyword.trim())}
              page={page}
              pageSize={pageSize}
              onPageChange={(nextPage, nextSize) =>
                setValues({ page: String(nextPage), size: String(nextSize) })
              }
            />
          </Card>
        </>
      )}
    </div>
  )
}
