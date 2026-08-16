'use client'

import { Alert, Descriptions, Drawer, Table, Tabs, Tag } from 'antd'
import useSWR from 'swr'
import ErrorAlert from '@/components/ErrorAlert'
import { fetcher } from '@/lib/client'
import type { DatasetSchema, DatasetView, SchemaColumn, SchemaMeasure, SchemaTable } from '@/lib/types'

/** 数据集结构抽屉：表 / 列 / 度量值 三 Tab（数据来自 getInfo Schema 扫描） */
export default function SchemaDrawer({
  open,
  onClose,
  dataset,
}: {
  open: boolean
  onClose: () => void
  dataset: DatasetView | null
}) {
  const { data, error, isLoading } = useSWR<{ schema: DatasetSchema }>(
    open && dataset ? `/api/datasets/schema?wid=${dataset.workspaceId}&did=${dataset.id}` : null,
    fetcher,
  )
  const schema = data?.schema

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={860}
      title={`数据集结构 — ${dataset?.name ?? ''}`}
    >
      {error && <ErrorAlert error={error} />}
      {isLoading && (
        <Alert
          type="info"
          showIcon
          message="正在扫描数据集结构…"
          description="首次扫描需要 5-15 秒（提交 getInfo 扫描并等待完成），之后缓存 30 分钟。"
        />
      )}
      {schema && (
        <>
          <Descriptions column={3} size="small" style={{ marginBottom: 16 }}>
            <Descriptions.Item label="表">{schema.tables.length}</Descriptions.Item>
            <Descriptions.Item label="列">{schema.columnCount}</Descriptions.Item>
            <Descriptions.Item label="度量值">{schema.measureCount}</Descriptions.Item>
          </Descriptions>
          <Tabs
            items={[
              {
                key: 'tables',
                label: `表（${schema.tables.length}）`,
                children: (
                  <Table<SchemaTable>
                    rowKey="name"
                    size="small"
                    dataSource={schema.tables}
                    pagination={{ pageSize: 15 }}
                    columns={[
                      { title: '表名', dataIndex: 'name', ellipsis: true },
                      {
                        title: '隐藏',
                        dataIndex: 'isHidden',
                        width: 70,
                        render: (v?: boolean) => (v ? <Tag>隐藏</Tag> : '-'),
                      },
                      {
                        title: '列数',
                        width: 70,
                        render: (_: unknown, t) => t.columns?.length ?? 0,
                      },
                      {
                        title: '度量值数',
                        width: 80,
                        render: (_: unknown, t) => t.measures?.length ?? 0,
                      },
                    ]}
                  />
                ),
              },
              {
                key: 'columns',
                label: `列（${schema.columnCount}）`,
                children: (
                  <Table<{ table: string; column: SchemaColumn }>
                    rowKey={(r) => `${r.table}.${r.column.name}`}
                    size="small"
                    dataSource={schema.tables.flatMap((t) =>
                      (t.columns ?? []).map((c) => ({ table: t.name, column: c })),
                    )}
                    pagination={{ pageSize: 20, showTotal: (t) => `共 ${t} 列` }}
                    columns={[
                      { title: '表', dataIndex: 'table', width: 200, ellipsis: true },
                      { title: '列名', dataIndex: ['column', 'name'], ellipsis: true },
                      {
                        title: '数据类型',
                        dataIndex: ['column', 'dataType'],
                        width: 120,
                        render: (v?: string) => <Tag>{v ?? '-'}</Tag>,
                      },
                    ]}
                  />
                ),
              },
              {
                key: 'measures',
                label: `度量值（${schema.measureCount}）`,
                children: (
                  <Table<{ table: string; measure: SchemaMeasure }>
                    rowKey={(r) => `${r.table}.${r.measure.name}`}
                    size="small"
                    dataSource={schema.tables.flatMap((t) =>
                      (t.measures ?? []).map((m) => ({ table: t.name, measure: m })),
                    )}
                    pagination={{ pageSize: 20, showTotal: (t) => `共 ${t} 个` }}
                    columns={[
                      { title: '表', dataIndex: 'table', width: 160, ellipsis: true },
                      { title: '度量值', dataIndex: ['measure', 'name'], ellipsis: true },
                      {
                        title: 'DAX 表达式',
                        dataIndex: ['measure', 'expression'],
                        ellipsis: true,
                        render: (v?: string) => (
                          <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{v ?? '-'}</span>
                        ),
                      },
                    ]}
                  />
                ),
              },
            ]}
          />
        </>
      )}
    </Drawer>
  )
}
