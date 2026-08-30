'use client'

import { useEffect, useRef, useState } from 'react'
import { Alert, App, Button, Descriptions, Input, Select, Space, Spin, Tabs, Tag, Typography } from 'antd'
import { CopyOutlined, ReloadOutlined } from '@ant-design/icons'
import useSWR from 'swr'
import dayjs from 'dayjs'
import ErrorAlert from '@/components/ErrorAlert'
import { fetcher } from '@/lib/client'
import type { ReportView } from '@/lib/types'

/** powerbi-client 页面对象（只用到的字段） */
interface PageLike {
  name?: string
  displayName?: string
}

/** powerbi-client 视觉对象（只用到的字段） */
interface VisualLike {
  name?: string
  title?: string
  type?: string
  getFilters?: () => Promise<FilterLike[]>
}

/** powerbi-client 页面级筛选器/切片器状态（只用到的字段） */
interface FilterLike {
  filterType?: string | number
  target?: { table?: string; column?: string; measure?: string }
  operator?: string
  values?: unknown[]
  conditions?: unknown[]
}

interface EmbedConfig {
  embedUrl: string
  embedToken: string
  tokenId?: string
  expiration?: string
  reportId: string
  workspaceId: string
  datasetId?: string
}

/** 嵌入式报表预览弹窗：内嵌渲染 + 嵌入配置（embedUrl / token / RLS 支持） */
export default function EmbedReportModal({
  open,
  onClose,
  report,
}: {
  open: boolean
  onClose: () => void
  report: ReportView | null
}) {
  const { message } = App.useApp()
  const containerRef = useRef<HTMLDivElement>(null)
  const [embedded, setEmbedded] = useState(false)
  const [embedError, setEmbedError] = useState<string | null>(null)
  const [rlsUsername, setRlsUsername] = useState('')
  const [rlsRole, setRlsRole] = useState('')
  const [showRlsForm, setShowRlsForm] = useState(false)

  // 构建 SWR key（有 RLS 输入时带参数）
  const embedKey = open && report
    ? `/api/reports/embed?wid=${report.workspaceId}&rid=${report.id}` +
      (rlsUsername && rlsRole ? `&rlsUsername=${encodeURIComponent(rlsUsername)}&rlsRole=${encodeURIComponent(rlsRole)}&datasetId=${report.datasetId}` : '')
    : null

  const { data: config, error, isLoading, mutate } = useSWR<EmbedConfig>(embedKey, fetcher)

  // 检测 RLS 错误自动显示表单
  useEffect(() => {
    if (error && /effective identity|RLS|行级安全/i.test(String(error.message ?? error))) {
      setShowRlsForm(true)
    }
  }, [error])

  // RLS 表单显示且有 datasetId 时获取可用角色列表
  const { data: rlsRolesData, isLoading: rlsRolesLoading } = useSWR<{ roles: string[] }>(
    showRlsForm && report?.datasetId && report?.workspaceId
      ? `/api/datasets/rls-roles?wid=${report.workspaceId}&did=${report.datasetId}`
      : null,
    fetcher,
    { revalidateOnFocus: false },
  )
  const rlsRoles = rlsRolesData?.roles ?? []

  // 埋点：会话 ID + 事件缓冲上报；currentPageRef 跟踪当前页（所有事件都带上页面名）
  const sessionIdRef = useRef<string>('')
  const currentPageRef = useRef<string>('')
  const lastSlicerCaptureRef = useRef(0)
  const eventBufferRef = useRef<Record<string, unknown>[]>([])
  const flushTimerRef = useRef<number | null>(null)

  useEffect(() => {
    if (open && !sessionIdRef.current) {
      sessionIdRef.current = `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
    }
    if (!open) {
      sessionIdRef.current = ''
      currentPageRef.current = ''
    }
  }, [open])

  function trackEvent(eventType: string, pageName?: string, details?: Record<string, unknown>) {
    if (!open || !report || !sessionIdRef.current) return
    const page = pageName ?? currentPageRef.current
    eventBufferRef.current.push({
      sessionId: sessionIdRef.current,
      reportId: report.id,
      workspaceId: report.workspaceId,
      eventType,
      pageName: page || undefined,
      rlsUsername: rlsUsername || undefined,
      rlsRole: rlsRole || undefined,
      details,
      reportName: report.name,
      ts: new Date().toISOString(),
    })
    scheduleFlush()
  }

  function scheduleFlush() {
    if (flushTimerRef.current !== null) return
    flushTimerRef.current = window.setTimeout(() => {
      flushTimerRef.current = null
      const events = eventBufferRef.current.splice(0)
      if (events.length === 0) return
      fetch('/api/embed-events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events }),
        keepalive: true,
      }).catch(() => {
        /* 上报失败静默（埋点不阻塞预览） */
      })
    }, 2000)
  }

  // 关闭时立即上报剩余事件
  useEffect(() => {
    return () => {
      const events = eventBufferRef.current.splice(0)
      if (events.length > 0 && sessionIdRef.current) {
        fetch('/api/embed-events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ events }),
          keepalive: true,
        }).catch(() => {})
      }
      if (flushTimerRef.current !== null) {
        window.clearTimeout(flushTimerRef.current)
        flushTimerRef.current = null
      }
    }
  }, [])

  // powerbi-client 动态加载并渲染报表
  useEffect(() => {
    if (!open || !config || !containerRef.current || embedded) return

    let cancelled = false
    ;(async () => {
      try {
        const pbi = await import('powerbi-client')
        if (cancelled || !containerRef.current) return
        const powerbi = new pbi.service.Service(
          pbi.factories.hpmFactory,
          pbi.factories.wpmpFactory,
          pbi.factories.routerFactory,
        )
        powerbi.reset(containerRef.current)
        const report = powerbi.embed(containerRef.current, {
          type: 'report',
          id: config.reportId,
          embedUrl: config.embedUrl,
          accessToken: config.embedToken,
          tokenType: 1, // models.TokenType.Embed
          settings: {
            panes: {
              filters: { expanded: false, visible: true },
              pageNavigation: { visible: true },
            },
          },
        })
        // 埋点：监听报表交互事件（powerbi-client SDK）
        // 注意：SDK 事件统一为 ICustomEvent，业务数据在 e.detail 里；
        // 'loaded' 是白名单事件名（'reportLoaded' 不是），埋点仍记为 reportLoaded
        const pbiReport = report as unknown as {
          on: (event: string, handler: (e: { detail?: Record<string, unknown> }) => void) => void
          getActivePage?: () => Promise<(PageLike & { getVisuals?: () => Promise<VisualLike[]> }) | undefined>
        }
        const onCurrentPage = (page: { name?: string; displayName?: string } | undefined) => {
          if (page?.displayName) currentPageRef.current = page.displayName
        }
        // 切片器值直接从切片器视觉对象读取（visual.getFilters()）。
        // 不用 page.getFilters()：它会把钻取/交叉筛选带过来的筛选值混进来，分不清哪些是用户在切片器里选的
        const captureSlicerStates = async (): Promise<Array<{ visual: string; table: string; column: string; operator?: string; values: unknown[] }>> => {
          try {
            const page = await pbiReport.getActivePage?.()
            if (!page?.getVisuals) return []
            const visuals = await page.getVisuals()
            const slicerVisuals = visuals.filter((v) => (v.type ?? '').toLowerCase() === 'slicer')
            const out: Array<{ visual: string; table: string; column: string; operator?: string; values: unknown[] }> = []
            for (const v of slicerVisuals) {
              try {
                const filters = (await v.getFilters?.()) ?? []
                for (const f of filters) {
                  if ((f.values?.length ?? 0) === 0 && (f.conditions?.length ?? 0) === 0) continue
                  out.push({
                    visual: v.title || v.name || '',
                    table: f.target?.table ?? '',
                    column: f.target?.column ?? f.target?.measure ?? '',
                    operator: f.operator,
                    values: (f.values ?? f.conditions ?? []).slice(0, 20),
                  })
                }
              } catch { /* 单个切片器读取失败不影响其余 */ }
            }
            return out.filter((s) => s.column)
          } catch {
            return []
          }
        }
        pbiReport.on('loaded', () => {
          // 首次打开不触发 pageChanged，主动查当前页；等渲染稳定后再取页面名和切片器状态
          pbiReport.getActivePage?.()
            .then((page) => {
              onCurrentPage(page)
              window.setTimeout(() => {
                captureSlicerStates().then((slicers) => trackEvent('reportLoaded', currentPageRef.current || undefined, slicers.length ? { slicers } : undefined))
              }, 800)
            })
            .catch(() => trackEvent('reportLoaded'))
        })
        pbiReport.on('pageChanged', (e) => {
          const page = (e?.detail as { newPage?: { name?: string; displayName?: string } } | undefined)?.newPage
          onCurrentPage(page)
          // 翻页后稍等新页筛选器就绪再取切片器状态
          window.setTimeout(() => {
            captureSlicerStates().then((slicers) => trackEvent('pageChanged', page?.displayName, slicers.length ? { slicers } : undefined))
          }, 600)
        })
        pbiReport.on('dataSelected', (e) => {
          // 只保留需要的字段，避免整包上报（含全部筛选器）被入库截断
          const d = (e?.detail ?? {}) as {
            page?: { displayName?: string }
            visual?: { title?: string; type?: string; name?: string }
            dataPoints?: Array<{ values?: Array<{ formattedValue?: string }> }>
          }
          trackEvent('dataSelected', undefined, {
            page: d.page?.displayName,
            visual: d.visual?.title || d.visual?.type || '未知图表',
            visualType: d.visual?.type,
            visualId: d.visual?.name,
            values: (d.dataPoints ?? []).flatMap((p) => (p.values ?? []).map((v) => v.formattedValue ?? '')).filter(Boolean).slice(0, 5),
          })
          // 用户点切片器时 SDK 只抛 dataSelected（visualType=slicer），不一定触发 filtersApplied；
          // 等选择落地后抓一次页面筛选器，有实际选择就补一条 filtersApplied 埋点（节流防重复）
          if (d.visual?.type === 'slicer') {
            const now = Date.now()
            if (now - lastSlicerCaptureRef.current > 2000) {
              lastSlicerCaptureRef.current = now
              window.setTimeout(() => {
                captureSlicerStates().then((slicers) => {
                  if (slicers.length) trackEvent('filtersApplied', undefined, { slicers })
                })
              }, 800)
            }
          }
        })
        pbiReport.on('buttonClicked', (e) => trackEvent('buttonClicked', undefined, e?.detail ?? {}))
        pbiReport.on('filtersApplied', () => {
          // SDK 的 filtersApplied 事件不带筛选值，稍等状态落地后读当前页切片器
          window.setTimeout(() => {
            captureSlicerStates().then((slicers) => trackEvent('filtersApplied', undefined, { slicers }))
          }, 500)
        })
        setEmbedded(true)
        setEmbedError(null)
      } catch (e) {
        if (!cancelled) setEmbedError(e instanceof Error ? e.message : String(e))
      }
    })()

    return () => {
      cancelled = true
    }
  }, [open, config, embedded])

  // 关闭时重置
  useEffect(() => {
    if (!open) {
      setEmbedded(false)
      setEmbedError(null)
      setRlsUsername('')
      setRlsRole('')
      setShowRlsForm(false)
    }
  }, [open])

  function copyText(text: string, label: string) {
    navigator.clipboard.writeText(text).then(
      () => message.success(`${label} 已复制`),
      () => message.error('复制失败'),
    )
  }

  const configJson = config
    ? JSON.stringify(
        {
          type: 'report',
          id: config.reportId,
          embedUrl: config.embedUrl,
          accessToken: config.embedToken,
          tokenType: 1,
          settings: { panes: { filters: { expanded: false, visible: true } } },
        },
        null,
        2,
      )
    : ''

  return (
    <>
      {open && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex',
            flexDirection: 'column',
            padding: '24px',
          }}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: 12,
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              maxHeight: 'calc(100vh - 48px)',
            }}
          >
            <div
              style={{
                padding: '12px 20px',
                borderBottom: '1px solid #f0f0f0',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <Typography.Title level={5} style={{ margin: 0, flex: 1 }}>
                报表预览 — {report?.name ?? ''}
              </Typography.Title>
              {config?.expiration && (
                <Tag color="orange">Token 过期: {dayjs(config.expiration).format('HH:mm:ss')}</Tag>
              )}
              <Button
                size="small"
                icon={<ReloadOutlined />}
                onClick={() => {
                  setEmbedded(false)
                  mutate()
                }}
              >
                刷新 Token
              </Button>
              <Button size="small" onClick={onClose}>
                关闭
              </Button>
            </div>
            <div style={{ flex: 1, overflow: 'auto', padding: '12px 20px' }}>
              {isLoading && (
                <div style={{ textAlign: 'center', padding: '80px 0' }}>
                  <Spin size="large" />
                  <p style={{ marginTop: 16, color: '#999' }}>正在获取嵌入配置…</p>
                </div>
              )}

              {error && (
                <div style={{ marginBottom: 16 }}>
                  <ErrorAlert error={error} />
                  {showRlsForm && report?.datasetId && (
                    <div
                      style={{
                        marginTop: 12,
                        padding: 16,
                        background: '#fafafa',
                        borderRadius: 8,
                        border: '1px solid #f0f0f0',
                      }}
                    >
                      <Typography.Text strong>RLS 有效身份</Typography.Text>
                      <p style={{ margin: '4px 0 12px', fontSize: 12, color: '#999' }}>
                        该数据集配置了行级安全性，需要指定用户名和角色才能生成 embed token。填写后点击重新生成。
                      </p>
                      <Space wrap>
                        <Input
                          placeholder="RLS 用户名（如 abc）"
                          value={rlsUsername}
                          onChange={(e) => setRlsUsername(e.target.value)}
                          style={{ width: 200 }}
                        />
                        {rlsRoles.length > 0 ? (
                          <Select
                            placeholder="选择 RLS 角色"
                            value={rlsRole || undefined}
                            onChange={setRlsRole}
                            style={{ width: 200 }}
                            showSearch
                            options={rlsRoles.map((role) => ({ value: role, label: role }))}
                          />
                        ) : (
                          <Input
                            placeholder={rlsRolesLoading ? '正在获取角色…' : '输入 RLS 角色名（如 A院端）'}
                            value={rlsRole}
                            onChange={(e) => setRlsRole(e.target.value)}
                            style={{ width: 200 }}
                          />
                        )}
                        <Button
                          type="primary"
                          disabled={!rlsUsername || !rlsRole}
                          onClick={() => {
                            setEmbedded(false)
                            mutate()
                          }}
                        >
                          重新生成
                        </Button>
                      </Space>
                      {rlsRoles.length === 0 && !rlsRolesLoading && (
                        <p style={{ margin: '8px 0 0', fontSize: 12, color: '#999' }}>
                          未自动获取到角色列表（XMLA 端点可能不可用），可直接输入角色名。
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {config && (
                <Tabs
                  defaultActiveKey="preview"
                  items={[
                    {
                      key: 'preview',
                      label: '报表预览',
                      children: (
                        <div style={{ height: 'calc(100vh - 260px)', minHeight: 400 }}>
                          {embedError && (
                            <Alert
                              type="error"
                              showIcon
                              message="报表渲染失败"
                              description={embedError}
                              style={{ marginBottom: 12 }}
                            />
                          )}
                          <div
                            ref={containerRef}
                            style={{ width: '100%', height: embedError ? '50%' : '100%', border: '1px solid #f0f0f0', borderRadius: 8 }}
                          />
                        </div>
                      ),
                    },
                    {
                      key: 'config',
                      label: '嵌入配置',
                      children: (
                        <div style={{ maxWidth: 800 }}>
                          <Descriptions column={1} size="small" style={{ marginBottom: 16 }}>
                            <Descriptions.Item label="报表 ID">
                              <Typography.Text copyable style={{ fontFamily: 'monospace', fontSize: 12 }}>
                                {config.reportId}
                              </Typography.Text>
                            </Descriptions.Item>
                            <Descriptions.Item label="工作区 ID">
                              <Typography.Text copyable style={{ fontFamily: 'monospace', fontSize: 12 }}>
                                {config.workspaceId}
                              </Typography.Text>
                            </Descriptions.Item>
                            {config.datasetId && (
                              <Descriptions.Item label="数据集 ID">
                                <Typography.Text copyable style={{ fontFamily: 'monospace', fontSize: 12 }}>
                                  {config.datasetId}
                                </Typography.Text>
                              </Descriptions.Item>
                            )}
                            <Descriptions.Item label="Token 过期时间">
                              {config.expiration ? dayjs(config.expiration).format('YYYY-MM-DD HH:mm:ss') : '-'}
                            </Descriptions.Item>
                          </Descriptions>

                          <div style={{ marginBottom: 16 }}>
                            <Typography.Text strong>Embed URL</Typography.Text>
                            <Input.Search
                              value={config.embedUrl}
                              readOnly
                              enterButton={<Button icon={<CopyOutlined />}>复制</Button>}
                              onSearch={() => copyText(config.embedUrl, 'Embed URL')}
                              style={{ marginTop: 4, fontFamily: 'monospace', fontSize: 12 }}
                            />
                          </div>

                          <div style={{ marginBottom: 16 }}>
                            <Typography.Text strong>Embed Token</Typography.Text>
                            <Input.Search
                              value={config.embedToken}
                              readOnly
                              enterButton={<Button icon={<CopyOutlined />}>复制</Button>}
                              onSearch={() => copyText(config.embedToken, 'Embed Token')}
                              style={{ marginTop: 4, fontFamily: 'monospace', fontSize: 12 }}
                            />
                          </div>

                          <div>
                            <Typography.Text strong>powerbi-client 配置片段</Typography.Text>
                            <Input.Search
                              value={configJson}
                              readOnly
                              enterButton={<Button icon={<CopyOutlined />}>复制</Button>}
                              onSearch={() => copyText(configJson, '配置 JSON')}
                              style={{ marginTop: 4 }}
                            />
                          </div>
                        </div>
                      ),
                    },
                  ]}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
