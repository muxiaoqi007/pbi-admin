'use client'

import { useMemo, useState } from 'react'
import { Alert, App, Button, Collapse, Input, Popconfirm, Space, Table, Tag, Typography } from 'antd'
import { CopyOutlined, DeleteOutlined, DownloadOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import useSWR from 'swr'
import ErrorAlert from '@/components/ErrorAlert'
import { fetcher } from '@/lib/client'
import { useDatasetTables, type CatalogTable } from '@/lib/use-dataset-tables'
import type { DatasetSchema, SchemaColumn, SchemaMeasure, SchemaTable } from '@/lib/types'

type ModelRow = { id: string; name: string; workspaceId: string; workspaceName: string; schema: DatasetSchema | null }
type ScanError = { workspaceIds: string[]; workspaceNames: string[]; message: string }
type ModelResponse = { mode: 'admin' | 'member'; fetchedAt: string; schemaFetchedAt: string; models: ModelRow[]; errors: ScanError[] }

function download(name: string, content: string) {
  const blob = new Blob([content], { type: 'application/json;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
  URL.revokeObjectURL(a.href)
}

function CodeBlock({ title, code }: { title: string; code: string }) {
  const { message } = App.useApp()
  return <div style={{ marginTop: 10 }}>
    <Space style={{ marginBottom: 6 }}>
      <Typography.Text strong>{title}</Typography.Text>
      <Button size="small" icon={<CopyOutlined />} onClick={() => { void navigator.clipboard.writeText(code); message.success('M 代码已复制') }}>复制</Button>
    </Space>
    <pre style={{ maxHeight: 320, overflow: 'auto', background: '#f6f6f6', padding: 10, whiteSpace: 'pre-wrap' }}>{code}</pre>
  </div>
}

function TableDetails({ table }: { table: SchemaTable }) {
  const partitions = (table.partitions ?? []).filter((partition) => partition.expression)
  return <div style={{ padding: '4px 0 12px 16px' }}>
    <Space wrap style={{ marginBottom: 8 }}>
      {(table.columns ?? []).map((column: SchemaColumn) => <Tag key={column.name}>{column.name}{column.dataType ? ' · ' + column.dataType : ''}</Tag>)}
    </Space>
    {(table.measures ?? []).length > 0 && <div><Typography.Text strong>度量值：</Typography.Text>{(table.measures ?? []).map((measure: SchemaMeasure) => measure.name).join('、')}</div>}
    {partitions.length > 0
      ? partitions.map((partition, index) => <CodeBlock key={(partition.name ?? '') + index} title={'Power Query / M · ' + (partition.name || `分区 ${index + 1}`)} code={partition.expression as string} />)
      : table.sourceExpression
        ? <CodeBlock title="Power Query / M" code={table.sourceExpression} />
        : <Typography.Text type="secondary">未返回该表的 M 表达式（可能是实时连接、权限或扫描能力限制）。</Typography.Text>}
  </div>
}

function sourceTag(table: CatalogTable) {
  if (table.catalogSource === 'rest') return <Tag color="green">REST 实时</Tag>
  if (table.catalogSource === 'dax') return <Tag color="cyan">DAX / INFO.VIEW</Tag>
  if (table.catalogSource === 'dmv') return <Tag color="purple">DMV / XMLA</Tag>
  if (table.catalogSource === 'schema') return <Tag color="geekblue">Admin Scanner</Tag>
  if (table.catalogSource === 'api-cache') return <Tag color="blue">API 缓存</Tag>
  if (table.catalogSource === 'legacy') return <Tag>旧缓存（来源未知）</Tag>
  return <Tag color="orange">手工录入</Tag>
}

function LightweightTables({ row }: { row: ModelRow }) {
  const { tables, error, isLoading, isValidating, mutate, clearCache } = useDatasetTables(row.workspaceId, row.id)
  if (isLoading && tables.length === 0) return <Typography.Text type="secondary">正在读取表清单…</Typography.Text>
  return <Space direction="vertical" style={{ width: '100%' }} size="middle">
    <Space wrap>
      <Button size="small" icon={<ReloadOutlined />} loading={isValidating} onClick={() => void mutate()}>重新读取实时数据</Button>
      <Popconfirm title="清除该数据集的浏览器缓存？" onConfirm={clearCache}>
        <Button size="small" danger icon={<DeleteOutlined />}>清除缓存</Button>
      </Popconfirm>
      <Typography.Text type="secondary">表名缓存位于当前浏览器 localStorage，按环境和数据集隔离。</Typography.Text>
    </Space>
    {error && <Alert type="warning" showIcon message="实时表结构读取失败" description={String(error.message ?? error) + (tables.length ? '；下方展示的是缓存/手工数据，不代表本次 API 调用成功。' : '')} />}
    <Table<CatalogTable> rowKey="name" size="small" pagination={false} dataSource={tables} locale={{ emptyText: '没有实时数据或缓存；可在刷新弹窗中手工录入表名。' }} columns={[
      { title: '表名', dataIndex: 'name' },
      { title: '来源', width: 150, render: (_: unknown, table) => sourceTag(table) },
      { title: '缓存时间', width: 190, render: (_: unknown, table) => table.cachedAt ? new Date(table.cachedAt).toLocaleString() : '-' },
      { title: '隐藏', width: 70, dataIndex: 'isHidden', render: (value?: boolean) => value ? <Tag>隐藏</Tag> : '-' },
    ]} />
  </Space>
}

function TableCountCell({ row }: { row: ModelRow }) {
  const needsFallback = !row.schema || row.schema.tables.length === 0
  const { tables, isLoading, error } = useDatasetTables(row.workspaceId, row.id, needsFallback)

  if (!needsFallback) return row.schema?.tables.length ?? '-'
  if (tables.length > 0) return <Tag color="cyan">{tables.length}（DAX）</Tag>
  if (isLoading) return <Tag color="processing">读取中</Tag>
  if (row.schema?.schemaRetrievalError && error) return <Tag color="red">不支持</Tag>
  return <Tag color="orange">未返回</Tag>
}

function ScannerEmptyDetails({ row }: { row: ModelRow }) {
  const scannerFacts = [
    row.schema?.storageMode ? `存储模式：${row.schema.storageMode}` : '',
    row.schema?.isRefreshable === undefined ? '' : `可刷新：${row.schema.isRefreshable ? '是' : '否'}`,
    row.schema?.configuredBy ? `配置者：${row.schema.configuredBy}` : '',
  ].filter(Boolean).join('；')
  const scannerMessage = row.schema?.schemaRetrievalError
    ? 'Scanner 已完成，但 Power BI 明确返回该模型不支持结构提取'
    : 'Scanner 已成功完成，但该模型没有返回表级详细元数据'
  const scannerDescription = row.schema?.schemaRetrievalError
    ? row.schema.schemaRetrievalError
    : '这与“连接无权限”不同。同一个工作区中，不同语义模型可能分别返回完整表结构或空 tables；常见原因是模型尚未产生可扫描的详细元数据，或模型类型、状态不支持。下方会继续尝试推送数据集 REST 接口，并展示按来源标记的缓存/手工表名。'

  return <Space direction="vertical" style={{ width: '100%' }} size="middle">
    <Alert type="warning" showIcon message={scannerMessage} description={<Space direction="vertical" size={4}><span>{scannerDescription}</span>{scannerFacts ? <Typography.Text type="secondary">Scanner 返回信息：{scannerFacts}</Typography.Text> : null}</Space>} />
    <LightweightTables row={row} />
  </Space>
}

export default function ModelsPage() {
  const [keyword, setKeyword] = useState('')
  const { message } = App.useApp()
  const { data, error, isLoading, isValidating, mutate } = useSWR<ModelResponse>('/api/models', fetcher)
  const rows = useMemo(() => {
    const search = keyword.trim().toLowerCase()
    return (data?.models ?? []).filter((model) => !search || [
      model.name,
      model.workspaceName,
      ...(model.schema?.tables ?? []).map((table) => table.name),
      ...(model.schema?.expressions ?? []).map((expression) => expression.name + ' ' + (expression.expression ?? '')),
    ].join(' ').toLowerCase().includes(search))
  }, [data, keyword])
  const metadataStats = useMemo(() => {
    const models = data?.models ?? []
    const returned = models.filter((model) => (model.schema?.tables.length ?? 0) > 0).length
    const unsupported = models.filter((model) => Boolean(model.schema?.schemaRetrievalError)).length
    const empty = models.filter((model) => model.schema && model.schema.tables.length === 0).length
    return { total: models.length, returned, unsupported, empty }
  }, [data])

  function exportModel(row: ModelRow) {
    download(row.workspaceName + '-' + row.name + '-model.json', JSON.stringify(row, null, 2))
    message.success('模型快照已下载')
  }

  return <div>
    {error && !data && <ErrorAlert error={error} onRetry={() => mutate()} />}
    <Space style={{ marginBottom: 16 }} wrap>
      <Input allowClear prefix={<SearchOutlined />} placeholder="搜索工作区 / 数据集 / 表 / M 代码" value={keyword} onChange={(event) => setKeyword(event.target.value)} style={{ width: 360 }} />
      <Button icon={<ReloadOutlined />} loading={isValidating} onClick={() => { void mutate(fetcher('/api/models?force=1')) }}>重新扫描</Button>
      <span className="text-muted">共 {rows.length} 个数据集</span>
    </Space>
    {data?.mode === 'member' && <Alert type="info" showIcon message="当前为成员视图" description="成员视图只影响工作区发现范围，不代表服务主体不能访问已加入工作区。完整表/列/M 结构仍取决于 Admin Scanner 或 XMLA 能力。" style={{ marginBottom: 16 }} />}
    {data?.errors?.length ? <Alert type="warning" showIcon message="完整结构扫描未成功，已保留数据集目录和独立表名读取" description={<ul style={{ marginBottom: 0 }}>{data.errors.map((scanError, index) => <li key={index}>{scanError.workspaceNames.length} 个工作区（{scanError.workspaceNames.slice(0, 3).join('、')}{scanError.workspaceNames.length > 3 ? '…' : ''}）：{scanError.message}</li>)}</ul>} style={{ marginBottom: 16 }} /> : null}
    {data && data.errors.length === 0 && metadataStats.empty > 0 ? <Alert
      type={metadataStats.returned > 0 ? 'warning' : 'error'}
      showIcon
      message={`Scanner 调用成功，但 ${metadataStats.empty}/${metadataStats.total} 个模型未返回表级元数据`}
      description={`这不是连接或 getInfo 权限失败：当前已有 ${metadataStats.returned} 个模型返回了表结构${metadataStats.unsupported ? `，另有 ${metadataStats.unsupported} 个模型明确标记为不支持` : ''}。请重点核对管理员门户“Enhance admin APIs responses with detailed metadata”和“Enhance admin APIs responses with DAX and mashup expressions”两个设置是否都对包含当前服务主体的安全组生效；模型本身也可能尚未产生可扫描的详细元数据。`}
      style={{ marginBottom: 16 }}
    /> : null}
    <Table<ModelRow> rowKey={(row) => row.workspaceId + ':' + row.id} loading={isLoading} dataSource={rows} pagination={{ pageSize: 10 }} columns={[
      { title: '数据集', dataIndex: 'name', ellipsis: true },
      { title: '工作区', dataIndex: 'workspaceName', width: 180, ellipsis: true },
      {
        title: '表',
        width: 110,
        render: (_: unknown, row) => <TableCountCell row={row} />,
      },
      { title: '列', width: 70, render: (_: unknown, row) => row.schema?.columnCount ?? '-' },
      { title: '度量值', width: 80, render: (_: unknown, row) => row.schema?.measureCount ?? '-' },
      { title: 'M 表达式', width: 100, render: (_: unknown, row) => (row.schema?.tables.some((table) => table.sourceExpression || table.partitions?.some((partition) => partition.expression)) || (row.schema?.expressions.length ?? 0) > 0) ? <Tag color="green">已获取</Tag> : <Tag color="orange">未返回</Tag> },
      { title: '操作', width: 150, render: (_: unknown, row) => <Button size="small" icon={<DownloadOutlined />} onClick={() => exportModel(row)}>导出快照</Button> },
    ]} expandable={{ expandedRowRender: (row) => row.schema && (row.schema.tables.length > 0 || row.schema.expressions.length > 0)
      ? <Collapse ghost items={[
          { key: 'tables', label: `表与 Power Query（${row.schema.tables.length}）`, children: <Table<SchemaTable> rowKey="name" size="small" pagination={{ pageSize: 12 }} dataSource={row.schema.tables} expandable={{ expandedRowRender: (table) => <TableDetails table={table} /> }} columns={[{ title: '表名', dataIndex: 'name' }, { title: '列', width: 70, render: (_: unknown, table) => table.columns?.length ?? 0 }, { title: '度量值', width: 80, render: (_: unknown, table) => table.measures?.length ?? 0 }, { title: '分区', width: 70, render: (_: unknown, table) => table.partitions?.length ?? 0 }, { title: 'M', width: 70, render: (_: unknown, table) => table.sourceExpression || table.partitions?.some((partition) => partition.expression) ? <Tag color="green">有</Tag> : '-' }]} /> },
          ...(row.schema.expressions.length ? [{ key: 'expressions', label: `数据集表达式（${row.schema.expressions.length}）`, children: <Space direction="vertical" style={{ width: '100%' }}>{row.schema.expressions.map((expression) => expression.expression ? <CodeBlock key={expression.name} title={expression.name} code={expression.expression} /> : null)}</Space> }] : []),
        ]} />
      : row.schema
        ? <ScannerEmptyDetails row={row} />
        : <LightweightTables row={row} /> }} />
  </div>
}
