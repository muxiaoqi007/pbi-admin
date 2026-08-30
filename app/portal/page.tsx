'use client'

import { useMemo, useState } from 'react'
import { App, Button, Card, Checkbox, Col, Drawer, Input, Modal, Popconfirm, Row, Space, Tag, Tooltip, Typography } from 'antd'
import {
  AppstoreOutlined,
  FolderAddOutlined,
  PlusOutlined,
  SearchOutlined,
  SettingOutlined,
  StarFilled,
  StarOutlined,
} from '@ant-design/icons'
import useSWR from 'swr'
import dayjs from 'dayjs'
import EmbedReportModal from '@/components/EmbedReportModal'
import ErrorAlert from '@/components/ErrorAlert'
import TableEmpty from '@/components/TableEmpty'
import { fetcher, postJSON } from '@/lib/client'
import type { ReportView, TenantSnapshot } from '@/lib/types'

interface PortalGroup {
  groupId: string
  name: string
  sortOrder: number
  items: { reportId: string; workspaceId: string }[]
}

const FAV_KEY = 'pbi-admin:portal-favorites'

function loadFavorites(): string[] {
  try {
    return JSON.parse(localStorage.getItem(FAV_KEY) ?? '[]') as string[]
  } catch {
    return []
  }
}

function saveFavorites(ids: string[]) {
  try {
    localStorage.setItem(FAV_KEY, JSON.stringify(ids))
  } catch {
    /* ignore */
  }
}

/** 业务报表门户：卡片目录 + 分组 + 收藏 + 内嵌预览（只读视图，不含管理操作） */
export default function PortalPage() {
  const { message } = App.useApp()
  const [keyword, setKeyword] = useState('')
  const [view, setView] = useState<'groups' | 'all'>('groups')
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false)
  const [favorites, setFavorites] = useState<string[]>([])
  const [previewReport, setPreviewReport] = useState<ReportView | null>(null)
  const [manageOpen, setManageOpen] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')

  const { data: snapshot, error: snapError, isLoading: snapLoading } = useSWR<TenantSnapshot>('/api/snapshot', fetcher, {
    keepPreviousData: true,
  })
  const { data: groupsData, mutate: mutateGroups } = useSWR<{ groups: PortalGroup[] }>('/api/portal-groups', fetcher)
  const groups = groupsData?.groups ?? []

  const reportById = useMemo(() => {
    const m = new Map<string, ReportView>()
    for (const r of snapshot?.reports ?? []) m.set(`${r.workspaceId}:${r.id}`, r)
    return m
  }, [snapshot])

  const groupOfReport = useMemo(() => {
    const m = new Map<string, string>()
    for (const g of groups) {
      for (const item of g.items) m.set(`${item.workspaceId}:${item.reportId}`, g.groupId)
    }
    return m
  }, [groups])

  function isFav(report: ReportView): boolean {
    return favorites.includes(`${report.workspaceId}:${report.id}`)
  }

  function toggleFav(report: ReportView) {
    const key = `${report.workspaceId}:${report.id}`
    const next = favorites.includes(key) ? favorites.filter((f) => f !== key) : [...favorites, key]
    setFavorites(next)
    saveFavorites(next)
  }

  const filtered = useMemo(() => {
    const k = keyword.trim().toLowerCase()
    let list = snapshot?.reports ?? []
    if (k) list = list.filter((r) => r.name.toLowerCase().includes(k) || r.workspaceName.toLowerCase().includes(k))
    if (showFavoritesOnly) list = list.filter((r) => isFav(r))
    return list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot, keyword, showFavoritesOnly, favorites])

  const ungrouped = useMemo(() => {
    return filtered.filter((r) => !groupOfReport.has(`${r.workspaceId}:${r.id}`))
  }, [filtered, groupOfReport])

  async function createGroup() {
    if (!newGroupName.trim()) return
    try {
      await postJSON('/api/portal-groups', { action: 'create', name: newGroupName.trim() })
      setNewGroupName('')
      mutateGroups()
      message.success('分组已创建')
    } catch (e) {
      message.error(e instanceof Error ? e.message : String(e))
    }
  }

  async function deleteGroup(groupId: string) {
    try {
      await postJSON('/api/portal-groups', { action: 'delete', groupId })
      mutateGroups()
      message.success('分组已删除')
    } catch (e) {
      message.error(e instanceof Error ? e.message : String(e))
    }
  }

  async function addReportToGroup(groupId: string, report: ReportView) {
    const group = groups.find((g) => g.groupId === groupId)
    if (!group) return
    const items = [...group.items.filter((i) => !(i.reportId === report.id && i.workspaceId === report.workspaceId)), { reportId: report.id, workspaceId: report.workspaceId }]
    try {
      await postJSON('/api/portal-groups', { action: 'setItems', groupId, items })
      mutateGroups()
      message.success(`已加入「${group.name}」`)
    } catch (e) {
      message.error(e instanceof Error ? e.message : String(e))
    }
  }

  async function removeReportFromGroup(groupId: string, report: ReportView) {
    const group = groups.find((g) => g.groupId === groupId)
    if (!group) return
    const items = group.items.filter((i) => !(i.reportId === report.id && i.workspaceId === report.workspaceId))
    try {
      await postJSON('/api/portal-groups', { action: 'setItems', groupId, items })
      mutateGroups()
      message.success('已从分组移除')
    } catch (e) {
      message.error(e instanceof Error ? e.message : String(e))
    }
  }

  function ReportCard({ report }: { report: ReportView }) {
    const key = `${report.workspaceId}:${report.id}`
    const groupId = groupOfReport.get(key)
    const group = groups.find((g) => g.groupId === groupId)
    return (
      <Card
        size="small"
        hoverable
        style={{ borderRadius: 12 }}
        styles={{ body: { padding: '14px 16px' } }}
        onClick={() => setPreviewReport(report)}
        title={
          <span style={{ fontSize: 14, fontWeight: 600 }}>{report.name}</span>
        }
        extra={
          <Space size={4} onClick={(e) => e.stopPropagation()}>
            <Tooltip title={isFav(report) ? '取消收藏' : '收藏'}>
              <Button
                type="text"
                size="small"
                icon={isFav(report) ? <StarFilled style={{ color: '#e8ad03' }} /> : <StarOutlined />}
                onClick={() => toggleFav(report)}
              />
            </Tooltip>
          </Space>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <Space size={6} wrap>
            <Tag>{report.workspaceName}</Tag>
            {group && <Tag color="gold">{group.name}</Tag>}
          </Space>
          <span style={{ fontSize: 12, color: '#999' }}>
            {report.modifiedDateTime ? `修改于 ${dayjs(report.modifiedDateTime).format('YYYY-MM-DD')}` : ''}
          </span>
        </div>
      </Card>
    )
  }

  return (
    <div style={{ minHeight: '70vh' }}>
      {/* 门户头部 */}
      <div style={{ marginBottom: 20 }}>
        <Typography.Title level={3} style={{ marginBottom: 4 }}>
          报表门户
        </Typography.Title>
        <Typography.Text type="secondary">
          点击卡片即可在线预览报表 · 收藏常用报表 · 星标只在当前浏览器保存
        </Typography.Text>
      </div>

      {snapError && !snapshot && <ErrorAlert error={snapError} />}

      {/* 工具栏 */}
      <div className="table-toolbar">
        <Input
          allowClear
          size="large"
          prefix={<SearchOutlined />}
          placeholder="搜索报表名称或工作区"
          style={{ width: 340 }}
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
        <SegmentedLike view={view} setView={setView} counts={{ groups: groups.length, all: filtered.length }} />
        <Button
          type={showFavoritesOnly ? 'primary' : 'default'}
          icon={<StarFilled />}
          onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
        >
          收藏{favorites.length > 0 ? ` ${favorites.length}` : ''}
        </Button>
        <div style={{ flex: 1 }} />
        <Button icon={<SettingOutlined />} onClick={() => setManageOpen(true)}>
          管理分组
        </Button>
      </div>

      {snapLoading && !snapshot && (
        <Row gutter={[16, 16]}>
          {Array.from({ length: 8 }).map((_, i) => (
            <Col key={i} xs={24} sm={12} md={8} lg={6}>
              <Card loading style={{ borderRadius: 12, height: 130 }} />
            </Col>
          ))}
        </Row>
      )}

      {snapshot && (
        <>
          {view === 'groups' ? (
            <>
              {/* 分组视图 */}
              {groups
                .filter((g) => {
                  const items = g.items
                    .map((i) => reportById.get(`${i.workspaceId}:${i.reportId}`))
                    .filter((r): r is ReportView => Boolean(r))
                    .filter((r) => {
                      const k = keyword.trim().toLowerCase()
                      if (showFavoritesOnly && !isFav(r)) return false
                      if (!k) return true
                      return r.name.toLowerCase().includes(k) || r.workspaceName.toLowerCase().includes(k)
                    })
                  return items.length > 0
                })
                .map((g) => {
                  const items = g.items
                    .map((i) => reportById.get(`${i.workspaceId}:${i.reportId}`))
                    .filter((r): r is ReportView => Boolean(r))
                    .filter((r) => {
                      const k = keyword.trim().toLowerCase()
                      if (showFavoritesOnly && !isFav(r)) return false
                      if (!k) return true
                      return r.name.toLowerCase().includes(k) || r.workspaceName.toLowerCase().includes(k)
                    })
                  return (
                    <div key={g.groupId} style={{ marginBottom: 28 }}>
                      <Typography.Title level={5} style={{ marginBottom: 12 }}>
                        <AppstoreOutlined style={{ marginInlineEnd: 6, color: '#e8ad03' }} />
                        {g.name}
                        <Tag style={{ marginInlineStart: 8 }}>{items.length}</Tag>
                      </Typography.Title>
                      <Row gutter={[16, 16]}>
                        {items.map((r) => (
                          <Col key={`${r.workspaceId}:${r.id}`} xs={24} sm={12} md={8} lg={6}>
                            <ReportCard report={r} />
                          </Col>
                        ))}
                      </Row>
                    </div>
                  )
                })}

              {/* 未分组 */}
              <div>
                <Typography.Title level={5} style={{ marginBottom: 12 }}>
                  全部报表
                  <Tag style={{ marginInlineStart: 8 }}>{ungrouped.length}</Tag>
                </Typography.Title>
                <Row gutter={[16, 16]}>
                  {ungrouped.map((r) => (
                    <Col key={`${r.workspaceId}:${r.id}`} xs={24} sm={12} md={8} lg={6}>
                      <ReportCard report={r} />
                    </Col>
                  ))}
                </Row>
                {ungrouped.length === 0 && groups.length > 0 && (
                  <div style={{ padding: '24px 0' }}>
                    <TableEmpty title="没有匹配的报表" description="调整搜索关键词，或切换到「全部」视图。" />
                  </div>
                )}
              </div>
            </>
          ) : (
            /* 全部视图 */
            <Row gutter={[16, 16]}>
              {filtered.map((r) => (
                <Col key={`${r.workspaceId}:${r.id}`} xs={24} sm={12} md={8} lg={6}>
                  <ReportCard report={r} />
                </Col>
              ))}
              {filtered.length === 0 && (
                <Col span={24}>
                  <TableEmpty title="没有匹配的报表" description="调整搜索关键词试试。" />
                </Col>
              )}
            </Row>
          )}
        </>
      )}

      {/* 预览 */}
      <EmbedReportModal open={!!previewReport} report={previewReport} onClose={() => setPreviewReport(null)} />

      {/* 分组管理抽屉 */}
      <Drawer open={manageOpen} onClose={() => setManageOpen(false)} width={520} title="管理报表分组">
        <Space.Compact style={{ width: '100%', marginBottom: 16 }}>
          <Input
            placeholder="新分组名称"
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            onPressEnter={createGroup}
          />
          <Button type="primary" icon={<FolderAddOutlined />} onClick={createGroup}>
            创建
          </Button>
        </Space.Compact>
        {groups.length === 0 && (
          <Typography.Text type="secondary">
            还没有分组。创建分组后，在下方列表勾选报表加入分组，门户首页会按分组展示。
          </Typography.Text>
        )}
        {groups.map((g) => (
          <Card
            key={g.groupId}
            size="small"
            style={{ marginBottom: 12 }}
            title={g.name}
            extra={
              <Popconfirm title="删除分组？（报表不会被删除）" onConfirm={() => deleteGroup(g.groupId)}>
                <Button size="small" danger type="text">
                  删除
                </Button>
              </Popconfirm>
            }
          >
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {g.items.length} 张报表
            </Typography.Text>
            <div style={{ marginTop: 8 }}>
              <Typography.Text strong style={{ fontSize: 12 }}>
                从全部报表中添加：
              </Typography.Text>
              <Input
                placeholder="搜索报表后勾选加入"
                size="small"
                prefix={<SearchOutlined />}
                style={{ margin: '6px 0' }}
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                readOnly
              />
              <div style={{ maxHeight: 220, overflow: 'auto', border: '1px solid #f0f0f0', borderRadius: 8, padding: 8 }}>
                {(snapshot?.reports ?? [])
                  .filter((r) => {
                    const k = keyword.trim().toLowerCase()
                    return !k || r.name.toLowerCase().includes(k) || r.workspaceName.toLowerCase().includes(k)
                  })
                  .slice(0, 100)
                  .map((r) => {
                    const key = `${r.workspaceId}:${r.id}`
                    const inGroup = g.items.some((i) => i.reportId === r.id && i.workspaceId === r.workspaceId)
                    return (
                      <div key={key} style={{ padding: '2px 0' }}>
                        <Checkbox
                          checked={inGroup}
                          onChange={(e) => {
                            if (e.target.checked) addReportToGroup(g.groupId, r)
                            else removeReportFromGroup(g.groupId, r)
                          }}
                        >
                          <span style={{ fontSize: 12 }}>
                            {r.name} <Tag style={{ fontSize: 11 }}>{r.workspaceName}</Tag>
                          </span>
                        </Checkbox>
                      </div>
                    )
                  })}
              </div>
            </div>
          </Card>
        ))}
        {groups.length === 0 && (
          <Button block icon={<PlusOutlined />} onClick={() => setNewGroupName(' ')}>
            创建第一个分组
          </Button>
        )}
      </Drawer>
    </div>
  )
}

function SegmentedLike({ view, setView, counts }: { view: 'groups' | 'all'; setView: (v: 'groups' | 'all') => void; counts: { groups: number; all: number } }) {
  return (
    <Space>
      <Button type={view === 'groups' ? 'primary' : 'default'} onClick={() => setView('groups')}>
        分组视图
      </Button>
      <Button type={view === 'all' ? 'primary' : 'default'} onClick={() => setView('all')}>
        全部
      </Button>
    </Space>
  )
}
