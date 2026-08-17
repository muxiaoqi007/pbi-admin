'use client'

import { useMemo, useState } from 'react'
import { Alert, App, Button, Card, Select, Space, Table, Tag, Typography } from 'antd'
import useSWR from 'swr'
import ErrorAlert from '@/components/ErrorAlert'
import { fetcher, postJSON } from '@/lib/client'
import type { TenantSnapshot, WorkspaceView } from '@/lib/types'

interface ToolRow extends WorkspaceView {
  spJoined: boolean
  spRole?: string
}

/** 批量把当前配置的服务主体加入工作区（触发刷新的前置条件） */
export default function ToolsPage() {
  const { message } = App.useApp()
  const [selected, setSelected] = useState<React.Key[]>([])
  const [role, setRole] = useState<'Admin' | 'Member' | 'Contributor'>('Admin')
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<{
    added: number
    unchanged: number
    failures: { workspaceId: string; error: string }[]
  } | null>(null)
  const { data, error, isLoading, mutate, isValidating } = useSWR<TenantSnapshot>(
    '/api/snapshot',
    fetcher,
    { keepPreviousData: true },
  )

  const memberMode = data?.mode === 'member'

  const rows = useMemo<ToolRow[]>(() => {
    const objectId = data?.activePrincipalObjectId?.toLowerCase()
    return (data?.workspaces ?? []).map((w) => ({
      ...w,
      ...(() => {
        const principal = objectId
          ? w.users.find(
              (u) =>
                u.principalType?.toLowerCase() === 'app' &&
                u.identifier.toLowerCase() === objectId,
            )
          : undefined
        return {
          spJoined: Boolean(principal),
          spRole: principal?.groupUserAccessRight,
        }
      })(),
    }))
  }, [data])

  async function run() {
    if (selected.length === 0) {
      message.warning('请先勾选要加入的工作区')
      return
    }
    setRunning(true)
    setResult(null)
    try {
      const res = await postJSON<{
        ok: boolean
        added: number
        unchanged: number
        failures: { workspaceId: string; error: string }[]
      }>(
        '/api/tools/sp-workspaces',
        { workspaceIds: selected, role },
      )
      setResult(res)
      if (res.ok) {
        message.success(
          res.added > 0
            ? `已成功加入 ${res.added} 个工作区`
            : `所选工作区均已存在该服务主体，无需重复加入`,
        )
      } else {
        message.warning(`完成，但 ${res.failures.length} 个工作区失败，详见下方明细`)
      }
      setSelected([])
      // 重新拉快照以反映成员变化
      mutate(() => fetcher('/api/snapshot?force=1'))
    } catch (e) {
      message.error(e instanceof Error ? e.message : String(e))
    } finally {
      setRunning(false)
    }
  }

  const notJoined = rows.filter((r) => !r.spJoined)

  return (
    <div style={{ maxWidth: 1000 }}>
      <Alert
        type={memberMode ? 'warning' : 'info'}
        showIcon
        style={{ marginBottom: 16 }}
        message={memberMode ? '当前为成员视图，可继续检查和管理可见工作区' : '把服务主体批量加入工作区'}
        description={
          <div>
            <p style={{ margin: '4px 0' }}>
              {memberMode
                ? '租户 Admin API 当前不可用，但普通工作区 API 仍然可用。下面会按访问令牌中的服务主体对象 ID 识别其现有角色；对尚未直接加入的可见工作区，将使用 /groups/{groupId}/users 尝试添加。'
                : '本工具会把「设置」页中配置的服务主体按所选角色批量加入工作区，加入后即可在「数据集」页触发刷新、读取表清单。'}
            </p>
            <p style={{ margin: '4px 0' }} className="text-muted">
              {memberMode
                ? '成员视图只能枚举当前服务主体已经能够访问的工作区，无法发现完全不可见的工作区。普通工作区成员管理仍要求调用主体在目标工作区具有足够权限；失败时会显示 Power BI 返回的具体原因。'
                : '建议使用 Admin 角色；如只需要刷新，Contributor 即可。'}
              当前检测到已直接加入 {rows.length - notJoined.length} 个，未检测到直接成员关系 {notJoined.length} 个
              （后者也可能是通过安全组获得访问权限）。
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
          rowSelection={{
            selectedRowKeys: selected,
            onChange: setSelected,
            getCheckboxProps: (record) => ({
              disabled: record.spJoined,
              title: record.spJoined ? `已加入（${record.spRole ?? '角色未知'}）` : undefined,
            }),
          }}
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
              render: (v: boolean, row: ToolRow) =>
                v ? <Tag color="green">已加入 · {row.spRole ?? '角色未知'}</Tag> : <Tag>未直接加入</Tag>,
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
              {result.failures.map((f, index) => (
                <li key={`${f.workspaceId}-${index}`}>
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
