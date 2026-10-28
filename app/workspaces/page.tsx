'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { Button, Input, Select, Table, Tag, Tooltip } from 'antd'
import { DownloadOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import ErrorAlert from '@/components/ErrorAlert'
import PageHeader from '@/components/PageHeader'
import StaleDataAlert from '@/components/StaleDataAlert'
import TableEmpty from '@/components/TableEmpty'
import { accessRightOf } from '@/components/UsersTable'
import { fetcher } from '@/lib/client'
import { exportCSV } from '@/lib/export'
import { useSnapshot } from '@/lib/use-snapshot'
import { useUrlState } from '@/lib/use-url-state'
import { workspaceStateMeta, workspaceTypeMeta } from '@/lib/domain/labels'
import type { WorkspaceView } from '@/lib/types'

const FILTER_DEFAULTS = { q: '', type: 'all', page: '1', size: '20' }

export default function WorkspacesPage() {
  const { values, setValues } = useUrlState(FILTER_DEFAULTS)
  const keyword = values.q
  const typeFilter = values.type
  const page = Math.max(1, Number(values.page) || 1)
  const pageSize = Math.max(1, Number(values.size) || 20)
  const { data, error, isLoading, mutate, isValidating } = useSnapshot()

  const filtered = useMemo(() => {
    const k = keyword.trim().toLowerCase()
    return (data?.workspaces ?? []).filter((w) => {
      const personal = w.type === 'Personal' || w.type === 'PersonalGroup'
      if (typeFilter === 'personal' && !personal) return false
      if (typeFilter === 'admin' && w.type !== 'AdminWorkspace') return false
      if (typeFilter === 'team' && (personal || w.type === 'AdminWorkspace')) return false
      if (!k) return true
      return w.name.toLowerCase().includes(k) || w.id.toLowerCase().includes(k)
    })
  }, [data, keyword, typeFilter])

  function doExport() {
    exportCSV(
      `工作区清单_${new Date().toISOString().slice(0, 10)}.csv`,
      ['名称', 'ID', '类型', '状态', '专用容量', '成员数', '报表数', '数据集数', '管理员'],
      filtered.map((w) => [
        w.name,
        w.id,
        workspaceTypeMeta(w.type).label,
        w.state ?? '',
        w.isOnDedicatedCapacity ? '是' : '否',
        w.users.length,
        w.reportCount,
        w.datasetCount,
        w.users
          .filter((u) => accessRightOf(u) === 'Admin')
          .map((u) => u.displayName || u.email || u.identifier)
          .join('、'),
      ]),
    )
  }

  return (
    <div>
      <PageHeader
        title="工作区"
        description="从租户视角查看工作区规模、容量、成员与内容分布，点击工作区可进入详情继续排查。"
        meta={
          data
            ? `数据快照：${dayjs(data.fetchedAt).format('YYYY-MM-DD HH:mm:ss')}`
            : isLoading
              ? '正在加载工作区…'
              : undefined
        }
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
          placeholder="搜索工作区名称 / ID"
          style={{ width: 320, maxWidth: '100%' }}
          value={keyword}
          onChange={(e) => setValues({ q: e.target.value, page: '1' })}
        />
        <Select
          value={typeFilter}
          onChange={(value) => setValues({ type: value, page: '1' })}
          style={{ width: 160, maxWidth: '100%' }}
          options={[
            { value: 'all', label: '全部类型' },
            { value: 'team', label: '团队工作区' },
            { value: 'personal', label: '个人工作区' },
            { value: 'admin', label: '管理工作区' },
          ]}
        />
        <span className="filter-summary">
          {isLoading && !data
            ? '正在加载工作区…'
            : keyword || typeFilter !== 'all'
              ? `筛选后 ${filtered.length} / ${data?.workspaces.length ?? 0} 个工作区`
              : `共 ${filtered.length} 个工作区`}
        </span>
      </div>

      <Table<WorkspaceView>
        rowKey="id"
        loading={isLoading}
        dataSource={filtered}
        scroll={{ x: 950 }}
        locale={{
          emptyText: (
            <TableEmpty
              title={
                isLoading && !data
                  ? '正在加载工作区…'
                  : keyword || typeFilter !== 'all'
                    ? '没有匹配的工作区'
                    : '暂无工作区'
              }
              description={
                isLoading && !data
                  ? '正在读取租户快照。'
                  : keyword || typeFilter !== 'all'
                    ? '尝试调整搜索关键词或类型筛选。'
                    : '当前环境没有可显示的工作区。'
              }
            />
          ),
        }}
        pagination={{
          current: page,
          pageSize,
          showSizeChanger: true,
          showTotal: (t) => `共 ${t} 个`,
          onChange: (nextPage, nextSize) =>
            setValues({ page: String(nextPage), size: String(nextSize) }),
        }}
        columns={[
          {
            title: '名称',
            dataIndex: 'name',
            ellipsis: true,
            render: (v: string, record) => <Link href={`/workspaces/${record.id}`}>{v}</Link>,
          },
          {
            title: '类型',
            dataIndex: 'type',
            width: 90,
            render: (v?: string) => {
              const meta = workspaceTypeMeta(v)
              return <Tag color={meta.color}>{meta.label}</Tag>
            },
          },
          {
            title: '状态',
            dataIndex: 'state',
            width: 90,
            render: (v?: string) => {
              const meta = workspaceStateMeta(v)
              return <Tag color={meta.color}>{meta.label}</Tag>
            },
          },
          {
            title: '专用容量',
            dataIndex: 'isOnDedicatedCapacity',
            width: 90,
            render: (v?: boolean) => (v ? <Tag color="gold">Premium</Tag> : <span className="text-muted">共享</span>),
          },
          { title: '成员', dataIndex: 'users', width: 80, render: (u: WorkspaceView['users']) => u.length },
          { title: '报表', dataIndex: 'reportCount', width: 80 },
          { title: '数据集', dataIndex: 'datasetCount', width: 80 },
          {
            title: '管理员',
            ellipsis: { showTitle: false },
            render: (_: unknown, w: WorkspaceView) => {
              const admins = w.users.filter((u) => accessRightOf(u) === 'Admin')
              if (admins.length === 0) return <span className="text-muted">未识别</span>
              const text = admins.map((a) => a.displayName || a.email || a.identifier).join('、')
              return <Tooltip title={text} placement="topLeft">{text}</Tooltip>
            },
          },
        ]}
      />
    </div>
  )
}
