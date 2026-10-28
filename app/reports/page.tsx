'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { Button, Input, Space, Table, Typography } from 'antd'
import { DownloadOutlined, ExportOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import ErrorAlert from '@/components/ErrorAlert'
import PageHeader from '@/components/PageHeader'
import StaleDataAlert from '@/components/StaleDataAlert'
import TableEmpty from '@/components/TableEmpty'
import { fetcher } from '@/lib/client'
import { exportCSV } from '@/lib/export'
import { useSnapshot } from '@/lib/use-snapshot'
import { useUrlState } from '@/lib/use-url-state'
import type { ReportView } from '@/lib/types'

const FILTER_DEFAULTS = { q: '', page: '1', size: '20' }

export default function ReportsPage() {
  const { values, setValues } = useUrlState(FILTER_DEFAULTS)
  const keyword = values.q
  const page = Math.max(1, Number(values.page) || 1)
  const pageSize = Math.max(1, Number(values.size) || 20)

  const { data, error, isLoading, mutate, isValidating } = useSnapshot()

  const datasetNameById = useMemo(() => {
    const m = new Map<string, string>()
    for (const d of data?.datasets ?? []) m.set(d.id, d.name)
    return m
  }, [data])

  const filtered = useMemo(() => {
    const k = keyword.trim().toLowerCase()
    if (!k) return data?.reports ?? []
    return (data?.reports ?? []).filter(
      (r) =>
        r.name.toLowerCase().includes(k) ||
        r.workspaceName.toLowerCase().includes(k) ||
        (r.datasetId ? datasetNameById.get(r.datasetId)?.toLowerCase().includes(k) : false),
    )
  }, [data, keyword, datasetNameById])

  function doExport() {
    exportCSV(
      `报表清单_${new Date().toISOString().slice(0, 10)}.csv`,
      ['报表', '工作区', '数据集', '修改时间', '链接'],
      filtered.map((r) => [
        r.name,
        r.workspaceName,
        (r.datasetId && datasetNameById.get(r.datasetId)) || '',
        r.modifiedDateTime ? dayjs(r.modifiedDateTime).format('YYYY-MM-DD HH:mm') : '',
        r.webUrl ?? '',
      ]),
    )
  }

  return (
    <div>
      <PageHeader
        title="报表"
        description="统一查看租户内报表、所属工作区、绑定数据集与页面结构，并快速跳转到 Power BI 打开。"
        meta={data ? `数据快照：${dayjs(data.fetchedAt).format('YYYY-MM-DD HH:mm:ss')}` : undefined}
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
          placeholder="搜索报表名称 / 工作区 / 数据集"
          style={{ width: 360, maxWidth: '100%' }}
          value={keyword}
          onChange={(e) => setValues({ q: e.target.value, page: '1' })}
        />
        <span className="filter-summary">
          {isLoading && !data
            ? '正在加载报表…'
            : keyword
              ? `筛选后 ${filtered.length} / ${data?.reports.length ?? 0} 张报表`
              : `共 ${filtered.length} 张报表`}
        </span>
      </div>

      <Table<ReportView>
        rowKey={(r) => `${r.workspaceId}:${r.id}`}
        loading={isLoading}
        dataSource={filtered}
        scroll={{ x: 1000 }}
        locale={{
          emptyText: (
            <TableEmpty
              title={
                isLoading && !data ? '正在加载报表…' : keyword ? '没有匹配的报表' : '暂无报表'
              }
              description={
                isLoading && !data
                  ? '正在读取租户快照。'
                  : keyword
                    ? '尝试搜索其他报表、工作区或数据集名称。'
                    : '当前环境没有可显示的报表。'
              }
            />
          ),
        }}
        pagination={{
          current: page,
          pageSize,
          showSizeChanger: true,
          showTotal: (t) => `共 ${t} 张`,
          onChange: (nextPage, nextSize) =>
            setValues({ page: String(nextPage), size: String(nextSize) }),
        }}
        columns={[
          {
            title: '报表',
            dataIndex: 'name',
            ellipsis: true,
            render: (value: string, record) => <Link href={`/reports/${record.id}`}>{value}</Link>,
          },
          {
            title: '工作区',
            dataIndex: 'workspaceName',
            width: 180,
            ellipsis: true,
            render: (v: string, r) => <Link href={`/workspaces/${r.workspaceId}`}>{v}</Link>,
          },
          {
            title: '数据集',
            dataIndex: 'datasetId',
            width: 180,
            ellipsis: true,
            render: (v?: string) => {
              if (!v) return <span className="text-muted">未绑定</span>
              const name = datasetNameById.get(v) ?? v
              return <Link href={`/datasets?q=${encodeURIComponent(name)}`}>{name}</Link>
            },
          },
          {
            title: '修改时间',
            dataIndex: 'modifiedDateTime',
            width: 160,
            render: (v?: string) => (v ? dayjs(v).format('YYYY-MM-DD HH:mm') : <span className="text-muted">未知</span>),
          },
          {
            title: '操作',
            width: 160,
            fixed: 'right',
            render: (_: unknown, r) => (
              <Space size={10}>
                <Link href={`/reports/${r.id}`}>详情</Link>
                {r.webUrl ? (
                  <Typography.Link href={r.webUrl} target="_blank">
                    <Space size={2}>打开 <ExportOutlined /></Space>
                  </Typography.Link>
                ) : (
                  <Typography.Text type="secondary">打开</Typography.Text>
                )}
              </Space>
            ),
          },
        ]}
      />
    </div>
  )
}
