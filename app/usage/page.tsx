'use client'

import { useMemo, useState } from 'react'
import { Alert, Button, Card, Col, Input, Row, Segmented, Space, Statistic, Table, Tabs, Tag, Tooltip, Typography } from 'antd'
import { DownloadOutlined, ReloadOutlined } from '@ant-design/icons'
import useSWR from 'swr'
import dayjs from 'dayjs'
import PageHeader from '@/components/PageHeader'
import ErrorAlert from '@/components/ErrorAlert'
import TableEmpty from '@/components/TableEmpty'
import { fetcher } from '@/lib/client'
import { exportCSV } from '@/lib/export'

interface UsageData {
  fetchedAt: string
  days: number
  recentReports: { id: string; name: string; workspaceName: string; modifiedDateTime?: string; modifiedBy?: string; webUrl?: string }[]
  recentDatasets: { id: string; name: string; workspaceName: string; modifiedDate?: string; configuredBy?: string }[]
  workspaceActivity: { id: string; name: string; recentReports: number; recentDatasets: number; totalReports: number; totalDatasets: number; memberCount: number }[]
  activityEvents: Record<string, unknown>[] | null
  activityError: string | null
  stats: { reportCount: number; datasetCount: number; recentReportCount: number; recentDatasetCount: number }
}

/** 使用分析：近期变更活跃度 + 活动事件（可用时） */
export default function UsagePage() {
  const [days, setDays] = useState<number>(7)
  const [keyword, setKeyword] = useState('')
  const { data, error, isLoading, mutate, isValidating } = useSWR<UsageData>(`/api/usage?days=${days}`, fetcher, {
    revalidateOnFocus: false,
  })

  const k = keyword.trim().toLowerCase()
  const filteredReports = useMemo(
    () => (data?.recentReports ?? []).filter((r) => !k || r.name.toLowerCase().includes(k) || r.workspaceName.toLowerCase().includes(k)),
    [data, k],
  )
  const filteredDatasets = useMemo(
    () => (data?.recentDatasets ?? []).filter((d) => !k || d.name.toLowerCase().includes(k) || d.workspaceName.toLowerCase().includes(k)),
    [data, k],
  )

  // 活动事件统计（可用时）
  const activityStats = useMemo(() => {
    const events = data?.activityEvents ?? []
    if (events.length === 0) return null
    const byActivity = new Map<string, number>()
    const byUser = new Map<string, number>()
    for (const e of events) {
      const act = String(e.Activity ?? e.activity ?? 'Unknown')
      byActivity.set(act, (byActivity.get(act) ?? 0) + 1)
      const user = String(e.UserId ?? e.user ?? e.User ?? '-')
      byUser.set(user, (byUser.get(user) ?? 0) + 1)
    }
    return {
      total: events.length,
      topActivities: [...byActivity.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10),
      topUsers: [...byUser.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10),
    }
  }, [data])

  return (
    <div>
      <PageHeader
        title="使用分析"
        description="近期内容变更活跃度与用户访问行为。活动日志需要管理 API 权限（国际版管理模式）；不可用时自动降级为变更活跃度视图。"
      />
      {error && <ErrorAlert error={error} onRetry={() => mutate()} />}
      <div className="table-toolbar">
        <Segmented
          value={days}
          onChange={(v) => setDays(Number(v))}
          options={[
            { value: 1, label: '今天' },
            { value: 7, label: '近 7 天' },
            { value: 30, label: '近 30 天' },
          ]}
        />
        <Input
          allowClear
          placeholder="搜索名称 / 工作区"
          style={{ width: 240 }}
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
        <span className="text-muted">{data ? `更新于 ${dayjs(data.fetchedAt).format('HH:mm:ss')}` : ''}</span>
        <Button icon={<ReloadOutlined />} loading={isValidating} onClick={() => mutate()}>
          刷新
        </Button>
      </div>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card><Statistic title="报表总数" value={data?.stats.reportCount ?? 0} loading={isLoading} /></Card>
        </Col>
        <Col span={6}>
          <Card><Statistic title={`近 ${days} 天修改报表`} value={data?.stats.recentReportCount ?? 0} loading={isLoading} /></Card>
        </Col>
        <Col span={6}>
          <Card><Statistic title="数据集总数" value={data?.stats.datasetCount ?? 0} loading={isLoading} /></Card>
        </Col>
        <Col span={6}>
          <Card><Statistic title={`近 ${days} 天修改数据集`} value={data?.stats.recentDatasetCount ?? 0} loading={isLoading} /></Card>
        </Col>
      </Row>

      {data?.activityError && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="活动日志不可用（成员模式或权限不足），以下展示基于内容变更的活跃度"
          description={data.activityError}
        />
      )}

      {activityStats && (
        <Card title={`用户活动（${activityStats.total} 条事件）`} style={{ marginBottom: 16 }} size="small">
          <Row gutter={16}>
            <Col span={12}>
              <Typography.Text strong>活动类型 TOP</Typography.Text>
              <div style={{ marginTop: 8 }}>
                {activityStats.topActivities.map(([act, count]) => (
                  <div key={act} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                    <Typography.Text style={{ fontSize: 12 }}>{act}</Typography.Text>
                    <Tag>{count}</Tag>
                  </div>
                ))}
              </div>
            </Col>
            <Col span={12}>
              <Typography.Text strong>活跃用户 TOP</Typography.Text>
              <div style={{ marginTop: 8 }}>
                {activityStats.topUsers.map(([user, count]) => (
                  <div key={user} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                    <Typography.Text style={{ fontSize: 12 }} ellipsis>{user}</Typography.Text>
                    <Tag>{count}</Tag>
                  </div>
                ))}
              </div>
            </Col>
          </Row>
        </Card>
      )}

      <Card title="工作区活跃度排行（按近期变更量）" style={{ marginBottom: 16 }} size="small">
        <Table
          rowKey="id"
          size="small"
          loading={isLoading}
          dataSource={data?.workspaceActivity ?? []}
          pagination={false}
          locale={{ emptyText: <TableEmpty /> }}
          columns={[
            { title: '工作区', dataIndex: 'name', ellipsis: true },
            { title: `近期修改报表`, dataIndex: 'recentReports', width: 110, render: (v: number) => (v > 0 ? <Tag color="green">{v}</Tag> : <Tag>{v}</Tag>) },
            { title: '近期修改数据集', dataIndex: 'recentDatasets', width: 120, render: (v: number) => (v > 0 ? <Tag color="green">{v}</Tag> : <Tag>{v}</Tag>) },
            { title: '报表总数', dataIndex: 'totalReports', width: 90 },
            { title: '数据集总数', dataIndex: 'totalDatasets', width: 100 },
            { title: '成员数', dataIndex: 'memberCount', width: 80 },
          ]}
        />
      </Card>

      <Tabs
        items={[
          {
            key: 'reports',
            label: `近期修改报表（${filteredReports.length}）`,
            children: (
              <Table
                rowKey="id"
                size="small"
                loading={isLoading}
                dataSource={filteredReports}
                pagination={{ pageSize: 15, showTotal: (t) => `共 ${t} 条` }}
                locale={{ emptyText: <TableEmpty title="该时段没有报表修改" /> }}
                columns={[
                  { title: '报表', dataIndex: 'name', ellipsis: true },
                  { title: '工作区', dataIndex: 'workspaceName', width: 160, ellipsis: true },
                  { title: '修改人', dataIndex: 'modifiedBy', width: 180, ellipsis: true, render: (v?: string) => v ?? '-' },
                  { title: '修改时间', dataIndex: 'modifiedDateTime', width: 150, render: (v?: string) => (v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '-') },
                ]}
              />
            ),
          },
          {
            key: 'datasets',
            label: `近期修改数据集（${filteredDatasets.length}）`,
            children: (
              <Table
                rowKey="id"
                size="small"
                loading={isLoading}
                dataSource={filteredDatasets}
                pagination={{ pageSize: 15, showTotal: (t) => `共 ${t} 条` }}
                locale={{ emptyText: <TableEmpty title="该时段没有数据集修改" /> }}
                columns={[
                  { title: '数据集', dataIndex: 'name', ellipsis: true },
                  { title: '工作区', dataIndex: 'workspaceName', width: 160, ellipsis: true },
                  { title: '配置人', dataIndex: 'configuredBy', width: 180, ellipsis: true, render: (v?: string) => v ?? '-' },
                  { title: '修改时间', dataIndex: 'modifiedDate', width: 150, render: (v?: string) => (v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '-') },
                ]}
              />
            ),
          },
          {
            key: 'embed',
            label: '门户预览埋点',
            children: <EmbedUsageTab days={days} />,
          },
        ]}
      />
    </div>
  )
}

interface EmbedUsage {
  totalEvents: number
  sessionCount: number
  reportViews: { reportId: string; workspaceId: string; name: string; views: number; sessions: number }[]
  pageViews: { reportId: string; pageName: string; views: number }[]
  interactions: { eventType: string; count: number }[]
  recentSessions: { sessionId: string; reportId: string; name: string; startedAt: string; events: number }[]
}

const EVENT_LABELS: Record<string, string> = {
  pageChanged: '翻页',
  dataSelected: '点击图表数据',
  buttonClicked: '点击按钮',
  filtersApplied: '应用筛选',
}

/** 门户预览埋点统计：谁看了哪个报表、翻页、点击、筛选 */
function EmbedUsageTab({ days }: { days: number }) {
  const { data, isLoading, mutate, isValidating } = useSWR<EmbedUsage>(`/api/embed-events?days=${days}`, fetcher, {
    revalidateOnFocus: false,
  })

  return (
    <div>
      <div className="table-toolbar">
        <span className="text-muted">
          统计通过本平台门户/预览打开报表的交互行为（SDK 埋点）。共 {data?.totalEvents ?? 0} 个事件、{data?.sessionCount ?? 0} 个会话。
        </span>
        <Button size="small" icon={<ReloadOutlined />} loading={isValidating} onClick={() => mutate()}>
          刷新
        </Button>
      </div>
      <Row gutter={16}>
        <Col span={8}>
          <Card size="small" title="报表观看排行">
            <Table
              rowKey="reportId"
              size="small"
              loading={isLoading}
              dataSource={data?.reportViews ?? []}
              pagination={false}
              locale={{ emptyText: <TableEmpty title="暂无预览记录" description="在门户或报表页点击「预览」后这里会出现数据。" /> }}
              columns={[
                { title: '报表', dataIndex: 'name', ellipsis: true },
                { title: '次数', dataIndex: 'views', width: 60 },
                { title: '会话', dataIndex: 'sessions', width: 60 },
              ]}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card size="small" title="页面热度">
            <Table
              rowKey={(r) => `${r.reportId}:${r.pageName}`}
              size="small"
              loading={isLoading}
              dataSource={data?.pageViews ?? []}
              pagination={false}
              locale={{ emptyText: <TableEmpty title="暂无翻页记录" /> }}
              columns={[
                { title: '页面', dataIndex: 'pageName', ellipsis: true },
                { title: '次数', dataIndex: 'views', width: 60 },
              ]}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card size="small" title="交互类型">
            <Table
              rowKey="eventType"
              size="small"
              loading={isLoading}
              dataSource={data?.interactions ?? []}
              pagination={false}
              locale={{ emptyText: <TableEmpty title="暂无交互记录" /> }}
              columns={[
                {
                  title: '类型',
                  dataIndex: 'eventType',
                  render: (v: string) => EVENT_LABELS[v] ?? v,
                },
                { title: '次数', dataIndex: 'count', width: 60 },
              ]}
            />
          </Card>
        </Col>
      </Row>
      <Card size="small" title="最近预览会话" style={{ marginTop: 16 }}>
        <Table
          rowKey={(r) => `${r.sessionId}:${r.reportId}`}
          size="small"
          loading={isLoading}
          dataSource={data?.recentSessions ?? []}
          pagination={{ pageSize: 10 }}
          locale={{ emptyText: <TableEmpty title="暂无会话" /> }}
          columns={[
            { title: '报表', dataIndex: 'name', ellipsis: true },
            { title: '开始时间', dataIndex: 'startedAt', width: 160, render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm:ss') },
            { title: '事件数', dataIndex: 'events', width: 80 },
            { title: '会话', dataIndex: 'sessionId', width: 140, render: (v: string) => <Typography.Text code style={{ fontSize: 11 }}>{v}</Typography.Text> },
          ]}
        />
      </Card>
    </div>
  )
}
