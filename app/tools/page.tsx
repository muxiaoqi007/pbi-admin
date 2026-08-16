'use client'

import { useMemo, useState } from 'react'
import { Alert, App, Button, Card, Select, Space, Table, Tag, Typography } from 'antd'
import useSWR from 'swr'
import ErrorAlert from '@/components/ErrorAlert'
import { fetcher, postJSON } from '@/lib/client'
import type { TenantSnapshot } from '@/lib/types'

/** 批量把当前配置的服务主体加入工作区（触发刷新的前置条件） */
export default function ToolsPage() {
  const { message } = App.useApp()
  const [selected, setSelected] = useState<React.Key[]>([])
  const [role, setRole] = useState<'Admin' | 'Member' | 'Contributor'>('Admin')
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<{ added: number; failures: { workspaceId: string; error: string }[] } | null>(null)

  const { data: configData } = useSWR<{ config: { clientId: string } }>('/api/config', fetcher)
  const { data, error, isLoading, mutate, isValidating } = useSWR<TenantSnapshot>(
    '/api/snapshot',
    fetcher,
    { keepPreviousData: true },
  )

  const clientId = configData?.config.clientId ?? ''
  const memberMode = data?.mode === 'member'

  const rows = useMemo(() => {
    return (data?.workspaces ?? []).map((w) => ({
      ...w,
      spJoined: w.users.some((u) => u.principalType === 'App' && u.identifier === clientId),
    }))
  }, [data, clientId])

  async function run() {
    if (selected.length === 0) {
      message.warning('请先勾选要加入的工作区')
      return
    }
    setRunning(true)
    setResult(null)
    try {
      const res = await postJSON<{ ok: boolean; added: number; failures: { workspaceId: string; error: string }[] }>(
        '/api/tools/sp-workspaces',
        { workspaceIds: selected, role },
      )
      setResult(res)
      if (res.ok) {
        message.success(`已成功加入 ${res.added} 个工作区`)
      } else {
        message.warning(`完成，但 ${res.failures.length} 个工作区失败，详见下方明细`)
      }
      // 重新拉快照以反映成员变化
      mutate(() => fetcher('/api/snapshot?force=1'))
    } catch (e) {
      message.error(e instanceof Error ? e.message : String(e))
    } finally {
      setRunning(false)
    }
  }

  const notJoined = rows.filter((r) => !r.spJoined)

  if (memberMode) {
    return (
      <div style={{ maxWidth: 1000 }}>
        <Alert
          type="warning"
          showIcon
          message="成员模式下此功能不可用"
          description={
            <div>
              <p style={{ margin: '4px 0' }}>
                当前云的管理 API 不支持服务主体（世纪互联即如此），无法通过工具批量把服务主体加入工作区。
              </p>
              <p style={{ margin: '4px 0' }}>
                替代做法：让各工作区管理员在 Power BI 服务中打开「工作区 → 访问权限 → 添加人员」，
                输入服务主体的名称或客户端 ID（
                <Typography.Text code>{clientId || '见设置页'}</Typography.Text>
                ），角色给「参与者」或「管理员」。加入后该工作区即可触发刷新。
              </p>
            </div>
          }
        />
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 1000 }}>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="把服务主体批量加入工作区"
        description={
          <div>
            <p style={{ margin: '4px 0' }}>
              Power BI 没有以管理员身份直接触发刷新的 API：调用刷新接口的服务主体必须是目标工作区的成员。
              本工具会把「设置」页中配置的服务主体（客户端 ID：
              <Typography.Text code>{clientId || '未配置'}</Typography.Text>
              ）按所选角色批量加入勾选的工作区，加入后即可在「数据集」页触发刷新、读取表清单。
            </p>
            <p style={{ margin: '4px 0' }} className="text-muted">
              建议使用 Admin 角色；如只需要刷新，Contributor 即可。当前未加入的工作区共 {notJoined.length} 个。
            </p>
          </div>
        }
      />

      {error && !data && <ErrorAlert error={error} onRetry={() => mutate()} />}

      <Card>
        <Space style={{ marginBottom: 12 }}>
          <Select
            value={role}
            onChange={setRole}
            style={{ width: 160 }}
            options={[
              { value: 'Admin', label: 'Admin（管理员）' },
              { value: 'Member', label: 'Member（成员）' },
              { value: 'Contributor', label: 'Contributor（参与者）' },
            ]}
          />
          <Button type="primary" loading={running} onClick={run}>
            加入 {selected.length > 0 ? `（已选 ${selected.length} 个）` : ''}
          </Button>
          <Button onClick={() => setSelected(notJoined.map((r) => r.id))}>全选未加入</Button>
          {isValidating && data && <span className="text-muted">正在刷新…</span>}
        </Space>

        <Table
          rowKey="id"
          loading={isLoading}
          dataSource={rows}
          rowSelection={{ selectedRowKeys: selected, onChange: setSelected }}
          pagination={{ pageSize: 20, showTotal: (t) => `共 ${t} 个` }}
          columns={[
            { title: '工作区', dataIndex: 'name', ellipsis: true },
            { title: '类型', dataIndex: 'type', width: 90 },
            { title: '成员数', dataIndex: 'users', width: 90, render: (u: unknown[]) => u.length },
            {
              title: '服务主体',
              dataIndex: 'spJoined',
              width: 110,
              filters: [
                { text: '已加入', value: true },
                { text: '未加入', value: false },
              ],
              onFilter: (v, r) => r.spJoined === v,
              render: (v: boolean) => (v ? <Tag color="green">已加入</Tag> : <Tag>未加入</Tag>),
            },
          ]}
        />
      </Card>

      {result && result.failures.length > 0 && (
        <Alert
          type="warning"
          showIcon
          style={{ marginTop: 16 }}
          message={`成功 ${result.added} 个，失败 ${result.failures.length} 个`}
          description={
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {result.failures.map((f) => (
                <li key={f.workspaceId}>
                  <Typography.Text code>{f.workspaceId}</Typography.Text>：{f.error}
                </li>
              ))}
            </ul>
          }
        />
      )}
    </div>
  )
}
