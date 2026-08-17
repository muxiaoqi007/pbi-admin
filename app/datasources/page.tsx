'use client'
import { useMemo, useState } from 'react'
import { Alert, Button, Input, Select, Table, Tag } from 'antd'
import { ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import useSWR from 'swr'
import dayjs from 'dayjs'
import ErrorAlert from '@/components/ErrorAlert'
import { fetcher } from '@/lib/client'
import { DATASOURCE_TYPE_LABELS, type DatasourceIndex, type DatasourceIndexItem } from '@/lib/types'

export default function DatasourcesPage() {
  const [keyword, setKeyword] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>()
  const { data, error, isLoading, mutate, isValidating } = useSWR<DatasourceIndex>('/api/datasources', fetcher, { keepPreviousData: true, revalidateOnFocus: false })
  const filtered = useMemo(() => {
    let list = data?.items ?? []
    if (typeFilter) list = list.filter((item) => item.type === typeFilter)
    const q = keyword.trim().toLowerCase()
    return q ? list.filter((item) => [item.primary, item.secondary, item.type, ...item.datasets.flatMap((d) => [d.name, d.workspaceName])].some((value) => value?.toLowerCase().includes(q))) : list
  }, [data, keyword, typeFilter])
  const typeOptions = useMemo(() => Array.from(new Set((data?.items ?? []).map((item) => item.type))).map((value) => ({ value, label: DATASOURCE_TYPE_LABELS[value] ?? value })), [data])
  return <div>
    {error && !data && <ErrorAlert error={error} onRetry={() => mutate()} />}
    <Alert type={data?.failed ? 'warning' : 'info'} showIcon style={{ marginBottom: 12 }} message="统一元数据目录" description={data ? '目录已持久化到服务端数据库文件，不再使用 10 分钟内存缓存。共 ' + data.models.length + ' 个模型，已有表结构 ' + data.models.filter((m) => m.tableCount > 0).length + ' 个；连接接口尝试 ' + data.attempted + ' 个，成功 ' + data.scanned + ' 个，失败 ' + data.failed + ' 个。更新时间 ' + dayjs(data.fetchedAt).format('YYYY-MM-DD HH:mm:ss') : '正在读取统一元数据目录…'} />
    {data?.failed ? <Alert type="warning" showIcon style={{ marginBottom: 12 }} message={data.failed + ' 个数据集的连接数据源接口读取失败'} description="接口失败不会再显示成“没有数据”。模型表目录与连接详情分别标记来源，并保存在同一个目录数据库中。" /> : null}
    <h3>模型表目录</h3>
    <Table rowKey={(row) => row.workspaceId + ':' + row.datasetId} size="small" loading={isLoading} dataSource={data?.models ?? []} pagination={{ pageSize: 10, showSizeChanger: true }} columns={[{ title: '数据集', dataIndex: 'datasetName', ellipsis: true }, { title: '工作区', dataIndex: 'workspaceName', width: 190 }, { title: '表数量', dataIndex: 'tableCount', width: 100, render: (value: number) => value ? <Tag color="cyan">{value}</Tag> : <Tag>尚未采集</Tag> }, { title: '来源', dataIndex: 'tableSource', width: 120, render: (value?: string) => value ? <Tag>{value.toUpperCase()}</Tag> : '-' }, { title: '更新时间', dataIndex: 'updatedAt', width: 180, render: (value: string) => dayjs(value).format('YYYY-MM-DD HH:mm:ss') }]} />
    <h3>连接数据源</h3>
    <div className="table-toolbar"><Input allowClear prefix={<SearchOutlined />} placeholder="搜索连接 / 数据库 / 数据集" style={{ width: 320 }} value={keyword} onChange={(event) => setKeyword(event.target.value)} /><Select allowClear placeholder="按类型筛选" style={{ width: 180 }} value={typeFilter} onChange={setTypeFilter} options={typeOptions} /><span className="text-muted">共 {filtered.length} 个</span><Button icon={<ReloadOutlined />} loading={isValidating} onClick={() => mutate(fetcher('/api/datasources?force=1'), { revalidate: false })}>强制重扫</Button></div>
    <Table<DatasourceIndexItem> rowKey="key" loading={isLoading} dataSource={filtered} pagination={{ pageSize: 20, showSizeChanger: true }} locale={{ emptyText: data?.failed ? '连接接口读取失败；请查看上方状态，模型表目录仍可使用' : '尚未采集到连接数据源' }} expandable={{ expandedRowRender: (item) => <Table rowKey={(row) => row.id} size="small" dataSource={item.datasets} pagination={false} columns={[{ title: '数据集', dataIndex: 'name' }, { title: '工作区', dataIndex: 'workspaceName' }]} /> }} columns={[{ title: '类型', dataIndex: 'type', width: 120, render: (value: string) => <Tag>{DATASOURCE_TYPE_LABELS[value] ?? value}</Tag> }, { title: '连接', dataIndex: 'primary', ellipsis: true }, { title: '数据库 / 连接器', dataIndex: 'secondary', width: 180, render: (value?: string) => value ?? '-' }, { title: '连接方式', dataIndex: 'gatewayId', width: 110, render: (value?: string) => value ? <Tag color="orange">本地网关</Tag> : <Tag color="green">云端</Tag> }, { title: '数据集数', dataIndex: 'datasetCount', width: 100 }]} />
  </div>
}

