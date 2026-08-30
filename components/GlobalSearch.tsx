'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Input, Popover, Tag, Typography } from 'antd'
import { SearchOutlined } from '@ant-design/icons'
import useSWR from 'swr'
import { fetcher } from '@/lib/client'
import type { TenantSnapshot } from '@/lib/types'

interface SearchItem {
  key: string
  type: 'workspace' | 'report' | 'dataset'
  typeLabel: string
  name: string
  sub: string
  href: string
}

/** 全局搜索：Header 搜索框，跨工作区/报表/数据集 */
export default function GlobalSearch() {
  const router = useRouter()
  const [keyword, setKeyword] = useState('')
  const [open, setOpen] = useState(false)

  const { data } = useSWR<TenantSnapshot>('/api/snapshot', fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
  })

  const results = useMemo<SearchItem[]>(() => {
    const k = keyword.trim().toLowerCase()
    if (!k || !data) return []
    const items: SearchItem[] = []
    for (const w of data.workspaces) {
      if (w.name.toLowerCase().includes(k)) {
        items.push({ key: `w-${w.id}`, type: 'workspace', typeLabel: '工作区', name: w.name, sub: `${w.reportCount} 报表 · ${w.datasetCount} 数据集`, href: `/workspaces/${w.id}` })
      }
    }
    for (const r of data.reports) {
      if (r.name.toLowerCase().includes(k)) {
        items.push({ key: `r-${r.workspaceId}-${r.id}`, type: 'report', typeLabel: '报表', name: r.name, sub: r.workspaceName, href: '/reports' })
      }
    }
    for (const d of data.datasets) {
      if (d.name.toLowerCase().includes(k)) {
        items.push({ key: `d-${d.id}`, type: 'dataset', typeLabel: '数据集', name: d.name, sub: d.workspaceName, href: '/datasets' })
      }
    }
    return items.slice(0, 12)
  }, [keyword, data])

  const TYPE_COLOR: Record<string, string> = { workspace: 'blue', report: 'green', dataset: 'purple' }

  const content = (
    <div style={{ width: 380, maxHeight: 420, overflow: 'auto' }}>
      {keyword.trim() === '' && (
        <Typography.Text type="secondary" style={{ padding: '8px 4px', display: 'block' }}>
          输入关键词搜索工作区、报表、数据集
        </Typography.Text>
      )}
      {keyword.trim() !== '' && results.length === 0 && (
        <Typography.Text type="secondary" style={{ padding: '8px 4px', display: 'block' }}>
          没有匹配的结果
        </Typography.Text>
      )}
      {results.map((item) => (
        <div
          key={item.key}
          style={{ padding: '8px 10px', borderRadius: 8, cursor: 'pointer', display: 'flex', gap: 8, alignItems: 'center' }}
          onClick={() => {
            setOpen(false)
            setKeyword('')
            router.push(item.href)
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = '#f5f5f5')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        >
          <Tag color={TYPE_COLOR[item.type]} style={{ marginInlineEnd: 0 }}>{item.typeLabel}</Tag>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>{item.name}</div>
            <div style={{ fontSize: 12, color: '#999', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.sub}</div>
          </div>
        </div>
      ))}
    </div>
  )

  return (
    <Popover
      content={content}
      trigger="click"
      open={open}
      onOpenChange={setOpen}
      placement="bottomRight"
      arrow={false}
    >
      <Input
        allowClear
        size="small"
        prefix={<SearchOutlined style={{ color: 'rgba(255,255,255,0.5)' }} />}
        placeholder="搜索工作区 / 报表 / 数据集"
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
        style={{ width: 220, background: 'rgba(255,255,255,0.12)', borderColor: 'transparent', color: '#fff' }}
      />
    </Popover>
  )
}
