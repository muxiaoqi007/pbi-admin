'use client'

import { Alert, Button, Card, Col, Row, Statistic, Table, Tag, Tooltip } from 'antd'
import { DownloadOutlined, ReloadOutlined, WarningOutlined } from '@ant-design/icons'
import useSWR from 'swr'
import dayjs from 'dayjs'
import ErrorAlert from '@/components/ErrorAlert'
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
  const { data: failuresData, error: failuresError, isValidating: failuresValidating, mutate: mutateFailures } =
    useSWR<{ failures: RefreshFailureItem[] }>('/api/refresh-failures', fetcher, {
      revalidateOnFocus: false,
    })
  const failures = failuresData?.failures ?? []

  function exportAll() {
    if (!snapshot) return
    const date = new Date().toISOString().slice(0, 10)
    // Sheet 1: 数据集
    exportCSV(`数据集清单_${date}.csv`, ['数据集', '工作区', '可刷新', '需要网关', '关联报表数', '配置者', '修改时间', 'ID'], snapshot.datasets.map((d) => [d.name, d.workspaceName, d.isRefreshable ? '是' : '否', d.isOnPremGatewayRequired ? '是' : '否', d.reportCount, d.configuredBy ?? '', d.modifiedDate ? dayjs(d.modifiedDate).format('YYYY-MM-DD HH:mm') : '', d.id]))
    // Sheet 2: 报表（延迟一下避免浏览器同时下载两个文件被拦）
    setTimeout(() => {
      exportCSV(`报表清单_${date}.csv`, ['报表', '工作区', '数据集ID', '类型', '修改时间', '链接'], snapshot.reports.map((r) => [r.name, r.workspaceName, r.datasetId ?? '', r.reportType ?? '', r.modifiedDateTime ? dayjs(r.modifiedDateTime).format('YYYY-MM-DD HH:mm') : '', r.webUrl ?? '']))
    }, 500)
  }
  const { data: refreshablesData, error: refreshablesError } = useSWR<{
    refreshables: PbiRefreshable[]
  }>(memberMode ? null : '/api/refreshables', fetcher)

  const memberCount = new Set(
    (snapshot?.workspaces ?? []).flatMap((w) => w.users.map((u) => u.identifier)),
  ).size

  return (
    <div>
      {error && !snapshot && <ErrorAlert error={error} onRetry={() => mutate()} />}
      {memberMode && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message={`成员模式：仅显示服务主体已加入的 ${snapshot.workspaces.length} 个工作区`}
          description="当前云的管理 API 不支持服务主体身份（世纪互联即如此），已自动降级为成员模式。浏览、数据源、刷新记录、触发刷新均可正常使用；「报表级用户」与「全租户刷新状态」依赖管理 API，暂不可用。"
        />
      )}
      <div className="table-toolbar">
        <span className="text-muted">
          {snapshot
            ? `数据快照时间：${dayjs(snapshot.fetchedAt).format('YYYY-MM-DD HH:mm:ss')}（缓存 5 分钟）`
            : isLoading
              ? '正在加载租户数据…'
              : ''}
        </span>
        <Button
          icon={<ReloadOutlined />}
          loading={isValidating}
          onClick={() => mutate(() => fetcher('/api/snapshot?force=1'))}
        >
          强制刷新
        </Button>
        <Button icon={<DownloadOutlined />} onClick={exportAll} disabled={!snapshot}>
          全租户导出（数据集+报表）
        </Button>
      </div>

      <Row gutter={16}>
        <Col span={5}>
          <Card>
            <Statistic title="工作区" value={snapshot?.workspaces.length ?? 0} loading={isLoading} />
          </Card>
        </Col>
        <Col span={5}>
          <Card>
            <Statistic title="报表" value={snapshot?.reports.length ?? 0} loading={isLoading} />
          </Card>
        </Col>
        <Col span={5}>
          <Card>
            <Statistic title="数据集" value={snapshot?.datasets.length ?? 0} loading={isLoading} />
          </Card>
        </Col>
        <Col span={5}>
          <Card>
            <Statistic title="工作区成员（去重）" value={memberCount} loading={isLoading} />
          </Card>
        </Col>
        <Col span={4}>
          <Card>
            <Statistic
              title="最近刷新失败"
              value={failures.length}
              loading={failuresValidating && !failuresData}
              valueStyle={failures.length > 0 ? { color: '#cf1322' } : undefined}
              prefix={failures.length > 0 ? <WarningOutlined /> : undefined}
            />
          </Card>
        </Col>
      </Row>

      <Card
        title={`刷新失败巡检（${failures.length} 个数据集最近一次刷新失败）`}
        style={{ marginTop: 16 }}
        extra={
          <div style={{ display: 'flex', gap: 8 }}>
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
              导出 CSV
            </Button>
          </div>
        }
      >
        {failuresError && <ErrorAlert error={failuresError} />}
        {!failuresError && failures.length === 0 && !failuresValidating && (
          <Alert type="success" showIcon message="巡检完成：所有可刷新数据集的最近一次刷新均成功。" />
        )}
        <Table
          rowKey="datasetId"
          size="small"
          loading={failuresValidating && !failuresData}
          dataSource={failures}
          pagination={{ pageSize: 10, showTotal: (t) => `共 ${t} 个` }}
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
                  <Tooltip title={f.error} placement="topLeft">
                    <span className="text-error">{f.error}</span>
                  </Tooltip>
                ) : (
                  '-'
                ),
            },
          ]}
        />
      </Card>

      {!memberMode && (
      <Card
        title="最近刷新状态（全租户可刷新项）"
        style={{ marginTop: 16 }}
        extra={
          refreshablesError ? (
            <Tooltip title={String(refreshablesError.message ?? refreshablesError)}>
              <Tag color="orange">不可用</Tag>
            </Tooltip>
          ) : null
        }
      >
        <Table
          rowKey={(r) => `${r.itemId ?? r.id ?? r.name}`}
          size="small"
          dataSource={refreshablesData?.refreshables ?? []}
          pagination={{ pageSize: 10 }}
          columns={[
            { title: '名称', dataIndex: 'name', ellipsis: true },
            {
              title: '最近状态',
              dataIndex: ['lastRefresh', 'status'],
              width: 90,
              render: (v?: string) =>
                v === 'Completed' ? (
                  <Tag color="green">成功</Tag>
                ) : v === 'Failed' ? (
                  <Tag color="red">失败</Tag>
                ) : (
                  <Tag>{v ?? '-'}</Tag>
                ),
            },
            {
              title: '最近刷新时间',
              dataIndex: ['lastRefresh', 'startTime'],
              width: 170,
              render: (v?: string) => (v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '-'),
            },
            {
              title: '刷新次数',
              dataIndex: 'refreshCount',
              width: 90,
              render: (v?: number) => v ?? '-',
            },
            {
              title: '错误',
              ellipsis: { showTitle: false },
              render: (_: unknown, r: PbiRefreshable) => {
                const raw = r.lastRefresh?.serviceExceptionJson
                if (!raw) return '-'
                let msg = raw
                try {
                  msg = JSON.parse(raw).error?.message ?? raw
                } catch {
                  /* 保留原文 */
                }
                return (
                  <Tooltip title={msg} placement="topLeft">
                    <span className="text-error">{msg}</span>
                  </Tooltip>
                )
              },
            },
          ]}
        />
      </Card>
      )}

      {!memberMode && !refreshablesData && !refreshablesError && (
        <Alert type="info" showIcon message="正在加载刷新状态…" style={{ marginTop: 16 }} />
      )}
    </div>
  )
}
