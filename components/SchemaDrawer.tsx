'use client'

import { useEffect, useState } from 'react'
import { Alert, App, Button, Descriptions, Drawer, Input, Space, Table, Tabs, Tag } from 'antd'
import { DownloadOutlined, SaveOutlined } from '@ant-design/icons'
import useSWR from 'swr'
import ErrorAlert from '@/components/ErrorAlert'
import { fetcher, postJSON } from '@/lib/client'
import type { DatasetSchema, DatasetView, SchemaColumn, SchemaMeasure, SchemaTable } from '@/lib/types'

interface NotesData {
  note: string
  columnNotes: Record<string, string>
}

/** 数据集结构与文档抽屉：表/列/度量值查看 + 数据集描述/字段备注编辑 + 文档导出 */
export default function SchemaDrawer({
  open,
  onClose,
  dataset,
}: {
  open: boolean
  onClose: () => void
  dataset: DatasetView | null
}) {
  const { message } = App.useApp()
  const [datasetNote, setDatasetNote] = useState('')
  const [columnNotes, setColumnNotes] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const { data, error, isLoading } = useSWR<{ schema: DatasetSchema }>(
    open && dataset ? `/api/datasets/schema?wid=${dataset.workspaceId}&did=${dataset.id}` : null,
    fetcher,
  )
  const schema = data?.schema

  const notesKey = open && dataset ? `/api/datasets/notes?wid=${dataset.workspaceId}&did=${dataset.id}` : null
  const { data: notesData } = useSWR<NotesData>(notesKey, fetcher)

  useEffect(() => {
    if (notesData) {
      setDatasetNote(notesData.note)
      setColumnNotes(notesData.columnNotes)
    }
  }, [notesData])

  async function saveNotes() {
    if (!dataset) return
    setSaving(true)
    try {
      await postJSON('/api/datasets/notes', {
        wid: dataset.workspaceId,
        did: dataset.id,
        note: datasetNote,
        columnNotes,
      })
      message.success('文档已保存')
    } catch (e) {
      message.error(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  const hasSchema = Boolean(schema && schema.tables.length > 0)

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={900}
      title={`数据集结构与文档 — ${dataset?.name ?? ''}`}
      extra={
        <Space>
          {hasSchema && (
            <a href={`/api/datasets/docs?wid=${dataset?.workspaceId}&did=${dataset?.id}`} target="_blank" rel="noreferrer">
              <Button size="small" icon={<DownloadOutlined />}>导出文档</Button>
            </a>
          )}
          <Button size="small" type="primary" icon={<SaveOutlined />} loading={saving} onClick={saveNotes}>
            保存文档
          </Button>
        </Space>
      }
    >
      {error && <ErrorAlert error={error} />}
      {isLoading && (
        <Alert
          type="info"
          showIcon
          message="正在查询数据集结构…"
          description="通过 DAX 目录查询（INFO.VIEW）获取表、列和度量值，约需 3-10 秒。"
        />
      )}
      <div style={{ marginBottom: 16 }}>
        <span style={{ fontWeight: 600, fontSize: 13 }}>数据集说明（业务含义、口径、负责人等）</span>
        <Input.TextArea
          value={datasetNote}
          onChange={(e) => setDatasetNote(e.target.value)}
          placeholder="填写这个数据集的业务说明，保存后会在数据集列表显示「已文档化」标记"
          autoSize={{ minRows: 2, maxRows: 5 }}
          style={{ marginTop: 6 }}
        />
      </div>
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
                      { title: '表', dataIndex: 'table', width: 140, ellipsis: true },
                      { title: '列名', dataIndex: ['column', 'name'], width: 150, ellipsis: true },
                      {
                        title: '类型',
                        dataIndex: ['column', 'dataType'],
                        width: 90,
                        render: (v?: string) => <Tag>{v ?? '-'}</Tag>,
                      },
                      {
                        title: '业务说明（可编辑）',
                        width: 300,
                        render: (_: unknown, r) => {
                          const key = `${r.table}.${r.column.name}`
                          return (
                            <Input
                              size="small"
                              value={columnNotes[key] ?? ''}
                              placeholder="填写字段业务含义"
                              onChange={(e) => setColumnNotes((prev) => ({ ...prev, [key]: e.target.value }))}
                            />
                          )
                        },
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
                      { title: '表', dataIndex: 'table', width: 140, ellipsis: true },
                      { title: '度量值', dataIndex: ['measure', 'name'], width: 160, ellipsis: true },
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
