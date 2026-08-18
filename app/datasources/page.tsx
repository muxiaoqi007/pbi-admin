'use client'

import { useMemo, useState } from 'react'
import { Alert, Button, Input, Select, Table, Tag, Tooltip } from 'antd'
import { DownloadOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import useSWR from 'swr'
import dayjs from 'dayjs'
import ErrorAlert from '@/components/ErrorAlert'
import StaleDataAlert from '@/components/StaleDataAlert'
import { fetcher } from '@/lib/client'
import { exportCSV } from '@/lib/export'
import { DATASOURCE_TYPE_LABELS, type DatasourceIndex, type DatasourceIndexItem } from '@/lib/types'

/** 数据源视角：按「类型 + 服务器/路径/网址 + 数据库」聚合并反查所有关联数据集（影响分析） */
export default function DatasourcesPage() {
  const [keyword, setKeyword] = useState('')
  const [typeFilter, setTypeFilter] = useState<string | undefined>()
  const [pageSize, setPageSize] = useState(20)

  const { data, error, isLoading, mutate, isValidating } = useSWR<DatasourceIndex>(
    '/api/datasources',
    fetcher,
    { keepPreviousData: true, revalidateOnFocus: false },
  )

  const typeOptions = useMemo(() => {
    const counts = new Map<string, number>()
    for (const item of data?.items ?? []) {
      counts.set(item.type, (counts.get(item.type) ?? 0) + 1)
    }
    return Array.from(counts.entries()).map(([t, n]) => ({
      value: t,
      label: `${DATASOURCE_TYPE_LABELS[t] ?? t}（${n}）`,
    }))
  }, [data])

  const filtered = useMemo(() => {
    let list = data?.items ?? []
    if (typeFilter) list = list.filter((i) => i.type === typeFilter)
    const k = keyword.trim().toLowerCase()
    if (k) {
      list = list.filter(
        (i) =>
          i.primary.toLowerCase().includes(k) ||
          (i.secondary ?? '').toLowerCase().includes(k) ||
          i.type.toLowerCase().includes(k) ||
          i.datasets.some((d) => d.name.toLowerCase().includes(k)),
      )
    }
    return list
  }, [data, keyword, typeFilter])

  function doExport() {
    exportCSV(
      `数据源视角_${new Date().toISOString().slice(0, 10)}.csv`,
      ['类型', '连接（服务器/路径/网址）', '数据库/连接器', '连接方式', '数据集数', '数据集清单'],
      filtered.map((i) => [
        DATASOURCE_TYPE_LABELS[i.type] ?? i.type,
        i.primary,
        i.secondary ?? '',
        i.gatewayId ? '本地网关' : '云端',
        i.datasetCount,
        i.datasets.map((d) => `${d.name} @ ${d.workspaceName}`).join('；'),
      ]),
    )
  }

  return (
    <div>
      {error && !data && <ErrorAlert error={error} onRetry={() => mutate()} />}
      {error && data && (
        <StaleDataAlert
          error={error}
          onRetry={() => mutate()}
          message="最新数据源扫描失败，当前仍显示上一次成功扫描的数据"
        />
      )}
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 12 }}
        message="数据源视角：按「类型 + 服务器/路径/网址 + 数据库」聚合并反查所有使用该数据源的数据集"
        description={
          <span className="text-muted">
            用于数据源迁移/改密码/故障时的影响分析。结果缓存 10 分钟。首次扫描需逐个查询数据集的数据源，可能需要十几秒到一分钟
            {data ? `（已聚合 ${data.items.length} 个数据源，扫描时间 ${dayjs(data.fetchedAt).format('HH:mm:ss')}）` : '…'}
          </span>
        }
      />
      <div className="table-toolbar">
        <Input
          allowClear
          prefix={<SearchOutlined />}
          placeholder="搜索连接地址 / 数据库 / 数据集名"
          style={{ width: 320 }}
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
        <Select
          allowClear
          placeholder="按类型筛选"
          style={{ width: 200 }}
          value={typeFilter}
          onChange={setTypeFilter}
          options={typeOptions}
        />
        <span className="text-muted">共 {filtered.length} 个数据源</span>
        <Button icon={<DownloadOutlined />} onClick={doExport} disabled={!data}>
          导出 CSV
        </Button>
        <Button
          icon={<ReloadOutlined />}
          loading={isValidating}
          onClick={() => mutate(() => fetcher('/api/datasources?force=1'))}
        >
          强制重扫
        </Button>
      </div>
      <Table<DatasourceIndexItem>
        rowKey="key"
        loading={isLoading}
        dataSource={filtered}
        scroll={{ x: 900 }}
        pagination={{
          pageSize,
          showSizeChanger: true,
          showTotal: (t) => `共 ${t} 个`,
          onShowSizeChange: (_, size) => setPageSize(size),
        }}
        expandable={{
          expandedRowRender: (i) => (
            <Table
              rowKey={(d) => d.id}
              size="small"
              dataSource={i.datasets}
              pagination={false}
              columns={[
                { title: '数据集', dataIndex: 'name', ellipsis: true },
                { title: '所在工作区', dataIndex: 'workspaceName', width: 200, ellipsis: true },
              ]}
            />
          ),
        }}
        columns={[
          {
            title: '类型',
            dataIndex: 'type',
            width: 110,
            render: (v: string) => <Tag>{DATASOURCE_TYPE_LABELS[v] ?? v}</Tag>,
          },
          {
            title: '连接（服务器 / 路径 / 网址）',
            dataIndex: 'primary',
            ellipsis: { showTitle: false },
            render: (v: string) => (
              <Tooltip title={v} placement="topLeft">
                {v}
              </Tooltip>
            ),
          },
          {
            title: '数据库 / 连接器',
            dataIndex: 'secondary',
            width: 160,
            ellipsis: true,
            render: (v?: string) => v ?? '-',
          },
          {
            title: '连接方式',
            dataIndex: 'gatewayId',
            width: 95,
            render: (v?: string) => (v ? <Tag color="orange">本地网关</Tag> : <Tag color="green">云端</Tag>),
          },
          {
            title: '数据集数',
            dataIndex: 'datasetCount',
            width: 90,
            sorter: (a, b) => a.datasetCount - b.datasetCount,
            render: (v: number) => (
              <Tag color={v >= 5 ? 'red' : v >= 2 ? 'gold' : 'default'}>{v}</Tag>
            ),
          },
        ]}
      />
    </div>
  )
}
