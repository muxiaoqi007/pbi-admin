'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { Alert, Button, Card, Col, Row, Space, Statistic, Table, Tag, Tooltip, Typography } from 'antd'
import {
  CheckCircleOutlined,
  DownloadOutlined,
  ReloadOutlined,
  SyncOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import useSWR from 'swr'
import dayjs from 'dayjs'
import ErrorAlert from '@/components/ErrorAlert'
import PageHeader from '@/components/PageHeader'
import StaleDataAlert from '@/components/StaleDataAlert'
import TableEmpty from '@/components/TableEmpty'
import { fetcher } from '@/lib/client'
import { exportCSV } from '@/lib/export'
import {
  buildOpsHealth,
  type RefreshFailureLike,
  type RefreshHealthItem,
  type WorkspaceHealthItem,
  type WorkspaceHealthState,
} from '@/lib/ops-health'
import type { PbiRefreshable, TenantSnapshot } from '@/lib/types'

function formatDuration(seconds?: number) {
  if (seconds === undefined) return '-'
  if (seconds < 60) return `${Math.round(seconds)}s`
  const minutes = Math.floor(seconds / 60)
  const rest = Math.round(seconds % 60)
  if (minutes < 60) return `${minutes}m ${rest}s`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ${minutes % 60}m`
}

function workspaceStateMeta(state: WorkspaceHealthState) {
  switch (state) {
    case 'critical':
      return { label: '异常', color: 'red' as const }
    case 'watch':
      return { label: '需观察', color: 'orange' as const }
    case 'active':
      return { label: '运行中', color: 'processing' as const }
    case 'healthy':
      return { label: '正常', color: 'green' as const }
    default:
      return { label: '未监控', color: 'default' as const }
  }
}

export default function OverviewPage() {
  const {
    data: snapshot,
    error,
    isLoading,
    mutate,
    isValidating,
  } = useSWR<TenantSnapshot>('/api/snapshot', fetcher, { keepPreviousData: true })

  const memberMode = snapshot?.mode === 'member'
  const snapshotLoaded = Boolean(snapshot)
  const {
    data: failuresData,
    error: failuresError,
    isValidating: failuresValidating,
    mutate: mutateFailures,
  } = useSWR<{ failures: RefreshFailureLike[] }>(snapshotLoaded ? '/api/refresh-failures' : null, fetcher, {
    revalidateOnFocus: false,
  })
  const failures = useMemo(() => failuresData?.failures ?? [], [failuresData])

  const {
    data: refreshablesData,
    error: refreshablesError,
    isValidating: refreshablesValidating,
    mutate: mutateRefreshables,
  } = useSWR<{ refreshables: PbiRefreshable[] }>(
    snapshot && snapshot.mode !== 'member' ? '/api/refreshables' : null,
    fetcher,
    { refreshInterval: 30_000, revalidateOnFocus: false },
  )
  const refreshables = useMemo(() => refreshablesData?.refreshables ?? [], [refreshablesData])
  const health = useMemo(
    () => buildOpsHealth(snapshot, refreshables, failures),
    [snapshot, refreshables, failures],
  )

  const memberCount = useMemo(
    () => new Set((snapshot?.workspaces ?? []).flatMap((workspace) => workspace.users.map((user) => user.identifier))).size,
    [snapshot],
  )
  const healthLoading = isValidating || failuresValidating || refreshablesValidating

  async function refreshAll() {
    const tasks: Promise<unknown>[] = [
      mutate(() => fetcher('/api/snapshot?force=1')),
      mutateFailures(() => fetcher('/api/refresh-failures?force=1')),
    ]
    if (!memberMode) tasks.push(mutateRefreshables())
    await Promise.all(tasks)
  }

  function exportAll() {
    if (!snapshot) return
    const date = new Date().toISOString().slice(0, 10)
    exportCSV(
      `数据集清单_${date}.csv`,
      ['数据集', '工作区', '可刷新', '需要网关', '关联报表数', '配置者', '修改时间', 'ID'],
      snapshot.datasets.map((dataset) => [
        dataset.name,
        dataset.workspaceName,
        dataset.isRefreshable ? '是' : '否',
        dataset.isOnPremGatewayRequired ? '是' : '否',
        dataset.reportCount,
        dataset.configuredBy ?? '',
        dataset.modifiedDate ? dayjs(dataset.modifiedDate).format('YYYY-MM-DD HH:mm') : '',
        dataset.id,
      ]),
    )
    setTimeout(() => {
      exportCSV(
        `报表清单_${date}.csv`,
        ['报表', '工作区', '数据集ID', '类型', '修改时间', '链接'],
        snapshot.reports.map((report) => [
          report.name,
          report.workspaceName,
          report.datasetId ?? '',
          report.reportType ?? '',
          report.modifiedDateTime ? dayjs(report.modifiedDateTime).format('YYYY-MM-DD HH:mm') : '',
          report.webUrl ?? '',
        ]),
      )
    }, 500)
  }

  function exportIssues() {
    exportCSV(
      `运维待处理_${new Date().toISOString().slice(0, 10)}.csv`,
      ['问题类型', '数据集', '工作区', '最近状态', '当前耗时', '历史基线', '耗时倍数', '错误'],
      health.actionableItems.map((item) => [
        item.status === 'Failed' ? '刷新失败' : '耗时离群',
        item.name,
        item.workspaceName ?? '',
        item.status,
        item.durationSeconds ?? '',
        item.baselineSeconds ?? '',
        item.durationRatio ? item.durationRatio.toFixed(2) : '',
        item.error ?? '',
      ]),
    )
  }

  return (
    <div>
      <PageHeader
        title="运营总览"
        description="先看需要处理的工作区和数据集，再进入具体刷新记录、模型或数据源排查。"
        meta={
          snapshot ? (
            <Space size={6} wrap>
              <Tag color={memberMode ? 'orange' : 'green'}>{memberMode ? '成员模式' : '租户管理模式'}</Tag>
              <Tag>工作区 {snapshot.workspaces.length}</Tag>
              <Tag>报表 {snapshot.reports.length}</Tag>
              <Tag>数据集 {snapshot.datasets.length}</Tag>
              <Tag>成员 {memberCount}</Tag>
              <span className="text-muted">快照 {dayjs(snapshot.fetchedAt).format('YYYY-MM-DD HH:mm:ss')}</span>
            </Space>
          ) : isLoading ? (
            '正在加载租户数据…'
          ) : undefined
        }
        actions={
          <>
            <Button icon={<ReloadOutlined />} loading={healthLoading} onClick={refreshAll}>
              刷新运维状态
            </Button>
            <Link href="/refreshes">
              <Button icon={<SyncOutlined />}>刷新监控</Button>
            </Link>
            <Button icon={<DownloadOutlined />} onClick={exportAll} disabled={!snapshot}>
              导出租户清单
            </Button>
          </>
        }
      />

      {error && !snapshot && <ErrorAlert error={error} onRetry={() => mutate()} />}
      {error && snapshot && <StaleDataAlert error={error} onRetry={() => mutate()} />}

      {memberMode && snapshot && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message={`成员模式：当前仅覆盖服务主体已加入的 ${snapshot.workspaces.length} 个工作区`}
          description={
            <>
              <div>{snapshot.adminFallbackReason ?? '租户级 Admin API 当前不可用，已自动降级为成员模式。'}</div>
              <div style={{ marginTop: 4 }}>
                失败巡检仍可使用；全租户运行中状态、历史耗时基线与耗时离群识别需要 Admin API。
              </div>
            </>
          }
        />
      )}

      <Row gutter={[16, 16]}>
        <Col xs={12} lg={6}>
          <Card className="metric-card">
            <Statistic
              title="需处理工作区"
              value={health.affectedWorkspaceCount}
              loading={isLoading}
              prefix={health.affectedWorkspaceCount > 0 ? <WarningOutlined /> : <CheckCircleOutlined />}
              valueStyle={health.affectedWorkspaceCount > 0 ? { color: '#cf1322' } : { color: '#389e0d' }}
            />
            <div className="metric-hint">存在刷新失败或耗时离群</div>
          </Card>
        </Col>
        <Col xs={12} lg={6}>
          <Card className="metric-card">
            <Statistic
              title="刷新失败"
              value={health.failedCount}
              loading={failuresValidating && !failuresData}
              valueStyle={health.failedCount > 0 ? { color: '#cf1322' } : undefined}
            />
            <div className="metric-hint">最近一次刷新明确失败</div>
          </Card>
        </Col>
        <Col xs={12} lg={6}>
          <Card className="metric-card">
            <Statistic
              title="耗时离群"
              value={memberMode ? '-' : health.durationOutlierCount}
              loading={!memberMode && refreshablesValidating && !refreshablesData}
              valueStyle={health.durationOutlierCount > 0 ? { color: '#d46b08' } : undefined}
            />
            <div className="metric-hint">相对自身历史基线的统计离群</div>
          </Card>
        </Col>
        <Col xs={12} lg={6}>
          <Card className="metric-card">
            <Statistic
              title="运行中 / 排队"
              value={memberMode ? '-' : health.activeCount}
              loading={!memberMode && refreshablesValidating && !refreshablesData}
              prefix={!memberMode && health.activeCount > 0 ? <SyncOutlined spin /> : undefined}
            />
            <div className="metric-hint">当前正在执行或等待执行</div>
          </Card>
        </Col>
      </Row>

      {!memberMode && health.durationModel.sampleSize > 0 && (
        <Alert
          type="info"
          showIcon
          style={{ marginTop: 16 }}
          message="耗时异常采用自适应统计规则"
          description={`当前有 ${health.durationModel.sampleSize} 个刷新项具备可比较的历史耗时基线。系统先计算“本次耗时 ÷ 自身历史中位数（无中位数时用均值）”，再用全租户比值分布的 Modified Z-Score > 3.5 标记离群，不使用固定的分钟阈值。`}
        />
      )}

      {(failuresError || refreshablesError) && (
        <Alert
          type="warning"
          showIcon
          style={{ marginTop: 16 }}
          message="部分运维健康数据暂不可用"
          description={
            failuresError
              ? `刷新失败巡检：${failuresError instanceof Error ? failuresError.message : String(failuresError)}`
              : `全租户刷新状态：${refreshablesError instanceof Error ? refreshablesError.message : String(refreshablesError)}`
          }
        />
      )}

      <Card
        className="section-card"
        title="待处理事项"
        style={{ marginTop: 16 }}
        extra={
          <Space wrap>
            <Tag color={health.actionableItems.length > 0 ? 'red' : 'green'}>
              {health.actionableItems.length > 0 ? `待处理 ${health.actionableItems.length}` : '当前无明确异常'}
            </Tag>
            <Button size="small" icon={<DownloadOutlined />} disabled={health.actionableItems.length === 0} onClick={exportIssues}>
              导出待处理
            </Button>
          </Space>
        }
      >
        <Table<RefreshHealthItem>
          rowKey="key"
          size="small"
          loading={healthLoading && health.actionableItems.length === 0}
          dataSource={health.actionableItems}
          scroll={{ x: 980 }}
          locale={{
            emptyText: (
              <TableEmpty
                title="当前没有明确待处理事项"
                description={memberMode ? '成员模式下会列出可访问数据集的最近刷新失败。' : '刷新失败或耗时统计离群会出现在这里。'}
              />
            ),
          }}
          pagination={{ pageSize: 10, showTotal: (total) => `共 ${total} 项` }}
          columns={[
            {
              title: '问题',
              width: 95,
              render: (_: unknown, item) =>
                item.status === 'Failed' ? <Tag color="red">刷新失败</Tag> : <Tag color="orange">耗时离群</Tag>,
            },
            { title: '数据集 / 刷新项', dataIndex: 'name', ellipsis: true },
            { title: '工作区', dataIndex: 'workspaceName', width: 150, ellipsis: true, render: (value?: string) => value ?? '-' },
            {
              title: '最近时间',
              dataIndex: 'startTime',
              width: 160,
              render: (value?: string) => (value ? dayjs(value).format('YYYY-MM-DD HH:mm:ss') : '-'),
            },
            {
              title: '本次 / 历史基线',
              width: 155,
              render: (_: unknown, item) =>
                item.durationSeconds !== undefined && item.baselineSeconds !== undefined
                  ? `${formatDuration(item.durationSeconds)} / ${formatDuration(item.baselineSeconds)}`
                  : '-',
            },
            {
              title: '耗时倍数',
              dataIndex: 'durationRatio',
              width: 95,
              render: (value?: number, item?: RefreshHealthItem) =>
                value ? (
                  <Tooltip title={item?.modifiedZ !== undefined ? `Modified Z-Score ${item.modifiedZ.toFixed(2)}` : '历史样本不足，未计算离群分数'}>
                    <span>{value.toFixed(2)}×</span>
                  </Tooltip>
                ) : '-',
            },
            {
              title: '错误 / 说明',
              ellipsis: { showTitle: false },
              render: (_: unknown, item) =>
                item.error ? (
                  <Tooltip title={item.error} placement="topLeft"><span className="text-error">{item.error}</span></Tooltip>
                ) : item.durationOutlier ? (
                  <span className="text-muted">当前耗时显著偏离租户同类比值分布</span>
                ) : '-',
            },
            {
              title: '定位',
              width: 150,
              fixed: 'right',
              render: (_: unknown, item) => (
                <Space size={4}>
                  <Link href={`/datasets?search=${encodeURIComponent(item.name)}`}>数据集</Link>
                  {item.workspaceId && <Link href={`/workspaces/${item.workspaceId}`}>工作区</Link>}
                </Space>
              ),
            },
          ]}
        />
      </Card>

      <Card
        className="section-card"
        title="工作区健康"
        style={{ marginTop: 16 }}
        extra={<Typography.Text type="secondary">异常优先排序 · 健康状态由下属刷新项聚合</Typography.Text>}
      >
        <Table<WorkspaceHealthItem>
          rowKey="workspaceId"
          size="small"
          loading={isLoading}
          dataSource={health.workspaceHealth}
          scroll={{ x: 840 }}
          locale={{ emptyText: <TableEmpty title="暂无工作区" description="当前环境没有可显示的工作区。" /> }}
          pagination={{ pageSize: 10, showTotal: (total) => `共 ${total} 个工作区` }}
          columns={[
            {
              title: '状态',
              dataIndex: 'state',
              width: 90,
              render: (state: WorkspaceHealthState) => {
                const meta = workspaceStateMeta(state)
                return <Tag color={meta.color}>{meta.label}</Tag>
              },
            },
            { title: '工作区', dataIndex: 'workspaceName', ellipsis: true },
            { title: '报表', dataIndex: 'reportCount', width: 75 },
            { title: '数据集', dataIndex: 'datasetCount', width: 75 },
            { title: '已监控刷新项', dataIndex: 'monitoredCount', width: 110 },
            {
              title: '异常构成',
              width: 230,
              render: (_: unknown, workspace) => (
                <Space size={4} wrap>
                  {workspace.failedCount > 0 && <Tag color="red">失败 {workspace.failedCount}</Tag>}
                  {workspace.durationOutlierCount > 0 && <Tag color="orange">耗时离群 {workspace.durationOutlierCount}</Tag>}
                  {workspace.activeCount > 0 && <Tag color="processing">运行中/排队 {workspace.activeCount}</Tag>}
                  {workspace.failedCount === 0 && workspace.durationOutlierCount === 0 && workspace.activeCount === 0 && (
                    <span className="text-muted">-</span>
                  )}
                </Space>
              ),
            },
            {
              title: '操作',
              width: 90,
              fixed: 'right',
              render: (_: unknown, workspace) => <Link href={`/workspaces/${workspace.workspaceId}`}>查看</Link>,
            },
          ]}
        />
      </Card>
    </div>
  )
}
