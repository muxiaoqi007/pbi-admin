'use client'

import { Alert, Button, Descriptions, Drawer, Table, Tag } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import useSWR from 'swr'
import dayjs from 'dayjs'
import ErrorAlert from '@/components/ErrorAlert'
import ErrorText from '@/components/ErrorText'
import { fetcher } from '@/lib/client'
import { responsiveDrawerWidth } from '@/lib/ui'
import { parseRefreshError } from '@/lib/domain/format'
import { refreshStatusMeta } from '@/lib/domain/labels'
import type { DatasetView, PbiRefresh, PbiRefreshSchedule } from '@/lib/types'

const DAY_LABELS: Record<string, string> = {
  Sunday: '周日', Monday: '周一', Tuesday: '周二', Wednesday: '周三',
  Thursday: '周四', Friday: '周五', Saturday: '周六',
}

function fmtDuration(r: PbiRefresh): string {
  if (!r.endTime) {
    return ['InProgress', 'NotStarted', 'Unknown'].includes(r.status ?? '') ? '进行中' : '-'
  }
  const ms = new Date(r.endTime).getTime() - new Date(r.startTime).getTime()
  if (!Number.isFinite(ms) || ms < 0) return '-'
  const s = Math.round(ms / 1000)
  return s >= 60 ? `${Math.floor(s / 60)} 分 ${s % 60} 秒` : `${s} 秒`
}

function fmtSchedule(s?: PbiRefreshSchedule) {
  if (!s) return '-'
  if (!s.enabled) return <Tag>未启用</Tag>
  const days = (s.days ?? []).map((d) => DAY_LABELS[d] ?? d).join('、') || '每天'
  const times = (s.times ?? []).join('、') || '-'
  const tz = s.localTimeZoneId ?? 'UTC'
  const notify = s.notifyOption === 'MailOnFailure' ? '失败时邮件通知' : s.notifyOption ?? '-'
  return (
    <Descriptions column={1} size="small" style={{ marginBottom: 0 }}>
      <Descriptions.Item label="状态"><Tag color="green">已启用</Tag></Descriptions.Item>
      <Descriptions.Item label="刷新时间">{days} {times}</Descriptions.Item>
      <Descriptions.Item label="时区">{tz}</Descriptions.Item>
      <Descriptions.Item label="通知">{notify}</Descriptions.Item>
    </Descriptions>
  )
}

/** 数据集刷新记录抽屉：打开期间每 30 秒轮询，确保刚提交的刷新也能在服务端出现后自动显示。 */
export default function RefreshHistoryDrawer({
  open,
  onClose,
  dataset,
}: {
  open: boolean
  onClose: () => void
  dataset: DatasetView | null
}) {
  const key =
    open && dataset ? `/api/datasets/refreshes?wid=${dataset.workspaceId}&did=${dataset.id}` : null
  const { data, error, isLoading, mutate, isValidating } = useSWR<{ refreshes: PbiRefresh[] }>(
    key,
    fetcher,
    {
      refreshInterval: open ? 30_000 : 0,
      revalidateOnFocus: open,
    },
  )

  const scheduleKey =
    open && dataset
      ? `/api/datasets/refresh-schedule?wid=${dataset.workspaceId}&did=${dataset.id}`
      : null
  const {
    data: scheduleData,
    error: scheduleError,
    mutate: mutateSchedule,
  } = useSWR<{ schedule: PbiRefreshSchedule }>(scheduleKey, fetcher)

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={responsiveDrawerWidth(760)}
      title={`刷新记录 — ${dataset?.name ?? ''}`}
      extra={
        <Button
          icon={<ReloadOutlined />}
          loading={isValidating}
          onClick={() => Promise.all([mutate(), mutateSchedule()])}
        >
          刷新
        </Button>
      }
    >
      <div style={{ marginBottom: 16, padding: 12, background: '#fafafa', borderRadius: 8 }}>
        <div style={{ fontWeight: 500, marginBottom: 8 }}>定时刷新计划</div>
        {scheduleError ? (
          <Alert
            type="warning"
            showIcon
            message="定时刷新计划读取失败"
            description={scheduleError instanceof Error ? scheduleError.message : String(scheduleError)}
            action={<Button size="small" onClick={() => mutateSchedule()}>重试</Button>}
          />
        ) : (
          fmtSchedule(scheduleData?.schedule)
        )}
      </div>

      {error && <ErrorAlert error={error} onRetry={() => mutate()} />}
      <Table
        rowKey={(r) => r.id ?? `${r.startTime}:${r.refreshType ?? ''}`}
        size="small"
        loading={isLoading && !data}
        dataSource={data?.refreshes ?? []}
        scroll={{ x: 760 }}
        locale={{ emptyText: isLoading ? '正在加载刷新记录…' : '暂无刷新记录' }}
        pagination={{ pageSize: 20, showTotal: (t) => `共 ${t} 条` }}
        columns={[
          {
            title: '开始时间',
            dataIndex: 'startTime',
            width: 160,
            render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm:ss'),
          },
          {
            title: '状态',
            dataIndex: 'status',
            width: 80,
            render: (v?: string) => {
              const meta = refreshStatusMeta(v)
              return <Tag color={meta.color}>{meta.label}</Tag>
            },
          },
          { title: '类型', dataIndex: 'refreshType', width: 110 },
          {
            title: '耗时',
            width: 100,
            render: (_: unknown, r: PbiRefresh) => fmtDuration(r),
          },
          {
            title: '错误信息',
            ellipsis: { showTitle: false },
            render: (_: unknown, r: PbiRefresh) => (
              <ErrorText text={parseRefreshError(r.serviceExceptionJson)} />
            ),
          },
        ]}
      />
      {data && isValidating && <p className="text-muted">正在检查最新刷新状态…</p>}
    </Drawer>
  )
}
