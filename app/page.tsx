'use client'

import { Alert, Button, Card, Col, Row, Statistic, Table, Tag, Tooltip } from 'antd'
import { CheckCircleOutlined, DownloadOutlined, ReloadOutlined, WarningOutlined } from '@ant-design/icons'
import useSWR from 'swr'
import dayjs from 'dayjs'
import ErrorAlert from '@/components/ErrorAlert'
import PageHeader from '@/components/PageHeader'
import StaleDataAlert from '@/components/StaleDataAlert'
import TableEmpty from '@/components/TableEmpty'
import { fetcher } from '@/lib/client'
import { exportCSV } from '@/lib/export'
import type { PbiRefreshable, TenantSnapshot } from '@/lib/types'

interface RefreshFailureItem {
  datasetId: string
  datasetName: string
  workspaceName: string
  startTime: string
  refreshType?: string
  error?: string
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
  const { data: failuresData, error: failuresError, isValidating: failuresValidating, mutate: mutateFailures } =
    useSWR<{ failures: RefreshFailureItem[] }>(snapshotLoaded ? '/api/refresh-failures' : null, fetcher, {
      revalidateOnFocus: false,
    })
  const failures = failuresData?.failures ?? []

  const { data: refreshablesData, error: refreshablesError } = useSWR<{
    refreshables: PbiRefreshable[]
  }>(snapshot && snapshot.mode !== 'member' ? '/api/refreshables' : null, fetcher)

  const refreshables = refreshablesData?.refreshables ?? []
  const refreshCompleted = refreshables.filter((r) => r.lastRefresh?.status === 'Completed').length
  const refreshFailed = refreshables.filter((r) => r.lastRefresh?.status === 'Failed').length
  const refreshActive = refreshables.filter((r) => ['InProgress', 'NotStarted'].includes(r.lastRefresh?.status ?? '')).length

  const memberCount = new Set(
    (snapshot?.workspaces ?? []).flatMap((w) => w.users.map((u) => u.identifier)),
  ).size

  function exportAll() {
    if (!snapshot) return
    const date = new Date().toISOString().slice(0, 10)
    exportCSV(
      `数据集清单_${date}.csv`,
      ['数据集', '工作区', '可刷新', '需要网关', '关联报表数', '配置者', '修改时间', 'ID'],
      snapshot.datasets.map((d) => [
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
    setTimeout(() => {
      exportCSV(
        `报表清单_${date}.csv`,
        ['报表', '工作区', '数据集ID', '类型', '修改时间', '链接'],
        snapshot.reports.map((r) => [
          r.name,
          r.workspaceName,
          r.datasetId ?? '',
          r.reportType ?? '',
          r.modifiedDateTime ? dayjs(r.modifiedDateTime).format('YYYY-MM-DD HH:mm') : '',
          r.webUrl ?? '',
        ]),
      )
    }, 500)
  }

  return (
    <div>
      <PageHeader
        title="运营总览"
        description="快速判断租户规模、刷新健康与异常数据集，把需要处理的问题放在最前面。"
        meta={
          snapshot
            ? `数据快照：${dayjs(snapshot.fetchedAt).format('YYYY-MM-DD HH:mm:ss')} · ${memberMode ? '成员模式' : '租户管理模式'}`
            : isLoading
              ? '正在加载租户数据…'
              : undefined
        }
        actions={
          <>
            <Button
              icon={<ReloadOutlined />}
              loading={isValidating}
              onClick={() => mutate(() => fetcher('/api/snapshot?force=1'))}
            >
              刷新快照
            </Button>
            <Button icon={<DownloadOutlined />} onClick={exportAll} disabled={!snapshot}>
              导出租户清单
            </Button>
          </>
        }
      />

      {error && !snapshot && <ErrorAlert error={error} onRetry={() => mutate()} />}
      {error && snapshot && <StaleDataAlert error={error} onRetry={() => mutate()} />}

      {memberMode && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message={`成员模式：当前仅覆盖服务主体已加入的 ${snapshot.workspaces.length} 个工作区`}
          description={
            <>
              <p style={{ margin: '4px 0' }}>
                {snapshot.adminFallbackReason ?? '租户级 Admin API 当前不可用，已自动降级为成员模式。'}
              </p>
              <p style={{ margin: '4px 0' }}>
                浏览、数据源、刷新记录和触发刷新仍可使用；报表级用户与全租户刷新状态依赖租户级 Admin API。
              </p>
            </>
          }
        />
      )}

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={8} xl={5}>
          <Card className="metric-card">
            <Statistic title="工作区" value={snapshot?.workspaces.length ?? 0} loading={isLoading} />
            <div className="metric-hint">当前可见工作区范围</div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={8} xl={5}>
          <Card className="metric-card">
            <Statistic title="报表" value={snapshot?.reports.length ?? 0} loading={isLoading} />
            <div className="metric-hint">租户内容规模</div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={8} xl={5}>
          <Card className="metric-card">
            <Statistic title="数据集" value={snapshot?.datasets.length ?? 0} loading={isLoading} />
            <div className="metric-hint">可进入刷新与模型排查</div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={12} xl={5}>
          <Card className="metric-card">
            <Statistic title="工作区成员（去重）" value={memberCount} loading={isLoading} />
            <div className="metric-hint">按成员标识去重统计</div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={12} xl={4}>
          <Card className="metric-card">
            <Statistic
              title="刷新异常"
              value={failures.length}
              loading={failuresValidating && !failuresData}
              valueStyle={failures.length > 0 ? { color: '#cf1322' } : { color: '#389e0d' }}
              prefix={failures.length > 0 ? <WarningOutlined /> : <CheckCircleOutlined />}
            />
            <div className="metric-hint">最近一次刷新失败的数据集</div>
          </Card>
        </Col>
      </Row>

      <Card
        className="section-card"
        title="刷新健康"
        style={{ marginTop: 16 }}
        extra={
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {failures.length > 0 ? <Tag color="red">需关注 {failures.length}</Tag> : <Tag color="green">当前正常</Tag>}
            <Button
              size="small"
              icon={<ReloadOutlined />}
              loading={failuresValidating}
              onClick={() => mutateFailures(() => fetcher('/api/refresh-failures?force=1'))}
            >
              重新巡检
            </Button>
            <Button
              size="small"
              icon={<DownloadOutlined />}
              disabled={failures.length === 0}
              onClick={() =>
                exportCSV(
                  `刷新失败巡检_${new Date().toISOString().slice(0, 10)}.csv`,
                  ['数据集', '工作区', '失败时间', '刷新类型', '错误信息'],
                  failures.map((f) => [
                    f.datasetName,
                    f.workspaceName,
                    dayjs(f.startTime).format('YYYY-MM-DD HH:mm:ss'),
                    f.refreshType ?? '',
                    f.error ?? '',
                  ]),
                )
              }
            >
              导出异常
            </Button>
          </div>
        }
      >
        {failuresError && <ErrorAlert error={failuresError} onRetry={() => mutateFailures()} />}
        {!failuresError && failures.length === 0 && !failuresValidating && (
          <Alert
            type="success"
            showIcon
            message="最近一次刷新巡检未发现失败数据集"
            description="这里检查的是各可刷新数据集最近一次刷新结果，不代表后续刷新不会出现异常。"
            style={{ marginBottom: 12 }}
          />
        )}
        <Table
          rowKey="datasetId"
          size="small"
          loading={failuresValidating && !failuresData}
          dataSource={failures}
          scroll={{ x: 800 }}
          locale={{ emptyText: <TableEmpty title="暂无刷新异常" description="最近一次刷新失败的数据集会出现在这里。" /> }}
          pagination={{ pageSize: 10, showTotal: (t) => `共 ${t} 个异常` }}
          columns={[
            { title: '数据集', dataIndex: 'datasetName', ellipsis: true },
            { title: '工作区', dataIndex: 'workspaceName', width: 150, ellipsis: true },
            {
              title: '失败时间',
              dataIndex: 'startTime',
              width: 160,
              render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm:ss'),
            },
            { title: '类型', dataIndex: 'refreshType', width: 100 },
            {
              title: '错误信息',
              ellipsis: { showTitle: false },
              render: (_: unknown, f: RefreshFailureItem) =>
                f.error ? (
                  <Tooltip title={f.error} placement="topLeft"><span className="text-error">{f.error}</span></Tooltip>
                ) : <span className="text-muted">未返回错误详情</span>,
            },
          ]}
        />
      </Card>

      {!memberMode && (
        <Card
          className="section-card"
          title="全租户刷新状态"
          style={{ marginTop: 16 }}
          extra={
            refreshablesError ? (
              <Tooltip title={String(refreshablesError.message ?? refreshablesError)}><Tag color="orange">状态不可用</Tag></Tooltip>
            ) : refreshablesData ? (
              <span className="text-muted">成功 {refreshCompleted} · 失败 {refreshFailed} · 进行中/排队 {refreshActive}</span>
            ) : null
          }
        >
          <Table
            rowKey={(r) => `${r.itemId ?? r.id ?? r.name}`}
            size="small"
            dataSource={refreshables}
            scroll={{ x: 760 }}
            locale={{ emptyText: <TableEmpty title="暂无刷新状态" description="当前没有返回全租户可刷新项。" /> }}
            pagination={{ pageSize: 10, showTotal: (t) => `共 ${t} 项` }}
            columns={[
              { title: '名称', dataIndex: 'name', ellipsis: true },
              {
                title: '最近状态',
                dataIndex: ['lastRefresh', 'status'],
                width: 100,
                render: (v?: string) =>
                  v === 'Completed' ? <Tag color="green">成功</Tag> :
                    v === 'Failed' ? <Tag color="red">失败</Tag> :
                      v === 'InProgress' ? <Tag color="blue">进行中</Tag> :
                        v === 'NotStarted' ? <Tag color="gold">排队中</Tag> : <Tag>{v ?? '未知'}</Tag>,
              },
              {
                title: '最近刷新时间',
                dataIndex: ['lastRefresh', 'startTime'],
                width: 170,
                render: (v?: string) => (v ? dayjs(v).format('YYYY-MM-DD HH:mm') : <span className="text-muted">无记录</span>),
              },
              { title: '刷新次数', dataIndex: 'refreshCount', width: 90, render: (v?: number) => v ?? '-' },
              {
                title: '错误',
                ellipsis: { showTitle: false },
                render: (_: unknown, r: PbiRefreshable) => {
                  const raw = r.lastRefresh?.serviceExceptionJson
                  if (!raw) return <span className="text-muted">-</span>
                  let msg = raw
                  try {
                    msg = JSON.parse(raw).error?.message ?? raw
                  } catch {
                    /* 保留原文 */
                  }
                  return <Tooltip title={msg} placement="topLeft"><span className="text-error">{msg}</span></Tooltip>
                },
              },
            ]}
          />
        </Card>
      )}

      {!memberMode && !refreshablesData && !refreshablesError && (
        <Alert type="info" showIcon message="正在加载全租户刷新状态…" style={{ marginTop: 16 }} />
      )}
    </div>
  )
}
