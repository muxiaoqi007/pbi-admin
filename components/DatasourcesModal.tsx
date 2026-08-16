'use client'

import { Modal, Table, Tag, Tooltip } from 'antd'
import useSWR from 'swr'
import { fetcher } from '@/lib/client'
import {
  CONNECTION_LABELS,
  DATASOURCE_TYPE_LABELS as TYPE_LABELS,
  type PbiDatasource,
} from '@/lib/types'

/** 把 connectionDetails 的所有键值对渲染成多行文本 */
function renderConnection(d: PbiDatasource): string {
  const cd = d.connectionDetails ?? {}
  const lines = Object.entries(cd)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${CONNECTION_LABELS[k] ?? k}: ${v}`)
  return lines.length > 0 ? lines.join('\n') : d.connectionString ?? '-'
}

/** 数据源弹窗：datasetId 为空时不请求（如报表未绑定数据集）；wid 用于成员模式路由 */
export default function DatasourcesModal({
  open,
  onClose,
  datasetId,
  datasetName,
  workspaceId,
}: {
  open: boolean
  onClose: () => void
  datasetId?: string
  datasetName?: string
  workspaceId?: string
}) {
  const { data, error, isLoading } = useSWR<{ datasources: PbiDatasource[] }>(
    open && datasetId
      ? `/api/datasets/${datasetId}/datasources${workspaceId ? `?wid=${workspaceId}` : ''}`
      : null,
    fetcher,
  )

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={760}
      title={`数据源 — ${datasetName ?? ''}`}
    >
      {!datasetId && <p>该数据集没有绑定的数据源信息。</p>}
      {datasetId && error && <p className="text-error">{String(error.message ?? error)}</p>}
      {datasetId && (
        <Table
          rowKey={(d) => `${d.datasourceType}-${d.datasourceId ?? d.name ?? Math.random()}`}
          loading={isLoading}
          dataSource={data?.datasources ?? []}
          pagination={false}
          columns={[
            {
              title: '类型',
              dataIndex: 'datasourceType',
              width: 110,
              render: (v: string) => <Tag>{TYPE_LABELS[v] ?? v}</Tag>,
            },
            {
              title: '连接详情',
              ellipsis: { showTitle: false },
              render: (_: unknown, d: PbiDatasource) => {
                const text = renderConnection(d)
                return (
                  <Tooltip title={<pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{text}</pre>} placement="topLeft">
                    <span style={{ whiteSpace: 'pre-line' }}>{text}</span>
                  </Tooltip>
                )
              },
            },
            {
              title: '连接方式',
              width: 90,
              render: (_: unknown, d: PbiDatasource) =>
                d.gatewayId ? <Tag color="orange">本地网关</Tag> : <Tag color="green">云端</Tag>,
            },
          ]}
        />
      )}
    </Modal>
  )
}
