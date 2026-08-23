'use client'

import { Alert, Button, Descriptions, Drawer, Space, Spin, Table, Tag } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import useSWR from 'swr'
import ErrorAlert from '@/components/ErrorAlert'
import { fetcher } from '@/lib/client'
import type { DatasetView } from '@/lib/types'

/** 数据集 RLS 角色查看抽屉（通过 XMLA TMSCHEMA_ROLES 查询） */
export default function RlsRolesDrawer({
  open,
  onClose,
  dataset,
}: {
  open: boolean
  onClose: () => void
  dataset: DatasetView | null
}) {
  const { data, error, isLoading, mutate, isValidating } = useSWR<{ roles: string[] }>(
    open && dataset ? `/api/datasets/rls-roles?wid=${dataset.workspaceId}&did=${dataset.id}` : null,
    fetcher,
    { revalidateOnFocus: false },
  )
  const roles = data?.roles ?? []

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={620}
      title={`RLS 角色 — ${dataset?.name ?? ''}`}
      extra={
        <Button icon={<ReloadOutlined />} loading={isValidating} onClick={() => mutate()}>
          重新获取
        </Button>
      }
    >
      {isLoading && (
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <Spin size="large" />
          <p style={{ marginTop: 16, color: '#999' }}>
            正在通过 XMLA 查询 RLS 角色…（需要 Premium 容量 + XMLA 端点开启）
          </p>
        </div>
      )}
      {error && (
        <>
          <ErrorAlert error={error} onRetry={() => mutate()} />
          <Alert
            type="info"
            showIcon
            style={{ marginTop: 12 }}
            message="XMLA 连接要求"
            description={
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                <li>工作区需在 Premium / Fabric 容量上</li>
                <li>Power BI 管理门户 → 租户设置 → 集成设置 →「XMLA 终结点」设为「读取」或「读写」</li>
                <li>服务主体需在工作区有成员权限</li>
              </ul>
            }
          />
        </>
      )}
      {data && (
        <>
          <Descriptions column={1} size="small" style={{ marginBottom: 16 }}>
            <Descriptions.Item label="数据集">{dataset?.name}</Descriptions.Item>
            <Descriptions.Item label="工作区">{dataset?.workspaceName}</Descriptions.Item>
            <Descriptions.Item label="角色数">{roles.length}</Descriptions.Item>
          </Descriptions>
          {roles.length === 0 ? (
            <Alert
              type="success"
              showIcon
              message="该数据集没有配置 RLS 角色"
              description="XMLA 连接成功，但 TMSCHEMA_ROLES 返回空列表 — 该数据集未配置行级安全性。"
            />
          ) : (
            <Table
              rowKey={(record: { name: string }) => record.name}
              size="small"
              dataSource={roles.map((name) => ({ name }))}
              pagination={false}
              columns={[
                {
                  title: '角色名',
                  dataIndex: 'name',
                  render: (name: string) => (
                    <Space>
                      <Tag color="blue">{name}</Tag>
                    </Space>
                  ),
                },
              ]}
            />
          )}
        </>
      )}
    </Drawer>
  )
}
