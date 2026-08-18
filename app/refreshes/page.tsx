'use client'

import { useMemo, useState } from 'react'
import { Alert, Button, Card, Col, Input, Row, Select, Space, Statistic, Table, Tag, Tooltip, Typography } from 'antd'
import { ReloadOutlined, SearchOutlined, SyncOutlined, WarningOutlined } from '@ant-design/icons'
import useSWR from 'swr'
import dayjs from 'dayjs'
import ErrorAlert from '@/components/ErrorAlert'
import PageHeader from '@/components/PageHeader'
import StaleDataAlert from '@/components/StaleDataAlert'
import TableEmpty from '@/components/TableEmpty'
import { fetcher } from '@/lib/client'
import type { PbiRefreshable, TenantSnapshot } from '@/lib/types'

function statusMeta(status?: string) {
  switch (status) {
    case 'Completed':
      return { label: '成功', color: 'green' as const }
    case 'Failed':
      return { label: '失败', color: 'red' as const }
    case 'InProgress':
      return { label: '进行中', color: 'processing' as const }
    case 'NotStarted':
      return { label: '排队中', color: 'gold' as const }
    case 'Unknown':
      return { label: '未知', color: 'default' as const }
    default:
      return { label: status || '无记录', color: 'default' as const }
  }
}

function errorMessage(raw?: string) {
  if (!raw) return ''
  try {
    const parsed = JSON.parse(raw) as { error?: { message?: string }; message?: string }
    return parsed.error?.message ?? parsed.message ?? raw
  } catch {
    return raw
  }
}

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
  const [keyword, setKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState<string | undefined>()
  const [pageSize, setPageSize] = useState(20)

  const {
    data: snapshot,
    error: snapshotError,
    isLoading: snapshotLoading,
    mutate: mutateSnapshot,
  } = useSWR<TenantSnapshot>('/api/snapshot', fetcher, { keepPreviousData: true })

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

  const refreshables = refreshData?.refreshables ?? []
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
        description="查看租户内可刷新项的最近刷新状态、执行时间、历史耗时统计和失败信息。页面每 30 秒自动检查一次最新状态。"
        meta={
          <Space size={6} wrap>
            <Tag color={adminMode ? 'green' : 'orange'}>{adminMode ? 'Admin 模式' : '成员模式'}</Tag>
            {lastUpdated && <Tag>最近任务：{dayjs(lastUpdated).format('YYYY-MM-DD HH:mm:ss')}</Tag>}
            {isValidating && <Tag color="processing">正在同步状态</Tag>}
          </Space>
        }
        actions={
          <Button icon={<ReloadOutlined />} loading={isValidating} onClick={() => mutateRefreshes()} disabled={!adminMode}>
            立即刷新状态
          </Button>
        }
      />

      {snapshotError && !snapshot && <ErrorAlert error={snapshotError} onRetry={() => mutateSnapshot()} />}
      {snapshotError && snapshot && <StaleDataAlert error={snapshotError} onRetry={() => mutateSnapshot()} />}

      {snapshot && snapshot.mode === 'member' && (
        <Alert
          type="warning"
          showIcon
          message="成员模式下无法获取全租户刷新状态"
          description="刷新监控依赖 Power BI 租户 Admin API 的 refreshables 能力。成员模式仍可在单个数据集的“刷新记录”中查看当前身份可访问的数据集。"
        />
      )}

      {adminMode && (
        <>
          {refreshError && <ErrorAlert error={refreshError} onRetry={() => mutateRefreshes()} />}

          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            <Col xs={12} md={6}>
              <Card className="metric-card">
                <Statistic title="进行中 / 排队" value={counts.active + counts.queued} prefix={<SyncOutlined spin={counts.active > 0} />} />
                <div className="metric-hint">进行中 {counts.active} · 排队 {counts.queued}</div>
              </Card>
            </Col>
            <Col xs={12} md={6}>
              <Card className="metric-card">
                <Statistic title="最近成功" value={counts.completed} />
                <div className="metric-hint">最近一次刷新状态为成功</div>
              </Card>
            </Col>
            <Col xs={12} md={6}>
              <Card className="metric-card">
                <Statistic
                  title="最近失败"
                  value={counts.failed}
                  prefix={counts.failed > 0 ? <WarningOutlined /> : undefined}
                  valueStyle={counts.failed > 0 ? { color: '#cf1322' } : undefined}
                />
                <div className="metric-hint">需要优先排查的刷新项</div>
              </Card>
            </Col>
            <Col xs={12} md={6}>
              <Card className="metric-card">
                <Statistic title="可监控项" value={refreshables.length} />
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
              onChange={(event) => setKeyword(event.target.value)}
              style={{ width: 320 }}
            />
            <Select
              allowClear
              placeholder="按最近状态筛选"
              value={statusFilter}
              onChange={setStatusFilter}
              style={{ width: 180 }}
              options={[
                { value: 'InProgress', label: '进行中' },
                { value: 'NotStarted', label: '排队中' },
                { value: 'Failed', label: '失败' },
                { value: 'Completed', label: '成功' },
                { value: 'Unknown', label: '未知' },
              ]}
            />
            <span className="filter-summary">显示 {filtered.length} / {rows.length} 个刷新项</span>
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
                pageSize,
                showSizeChanger: true,
                showTotal: (total) => `共 ${total} 个`,
                onShowSizeChange: (_, size) => setPageSize(size),
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
                    const meta = statusMeta(status)
                    return <Tag color={meta.color}>{meta.label}</Tag>
                  },
                },
                {
                  title: '开始时间',
                  dataIndex: ['lastRefresh', 'startTime'],
                  width: 165,
                  render: (value?: string) => (value ? dayjs(value).format('YYYY-MM-DD HH:mm:ss') : '-'),
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
                  render: (_: unknown, row) => {
                    const text = errorMessage(row.lastRefresh?.serviceExceptionJson)
                    return text ? (
                      <Tooltip title={text} placement="topLeft">
                        <span className="text-error">{text}</span>
                      </Tooltip>
                    ) : (
                      '-'
                    )
                  },
                },
              ]}
            />
          </Card>
        </>
      )}
    </div>
  )
}
