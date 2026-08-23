'use client'

import { useEffect, useRef, useState } from 'react'
import { Alert, App, Button, Descriptions, Input, Space, Spin, Tabs, Tag, Typography } from 'antd'
import { CopyOutlined, ReloadOutlined } from '@ant-design/icons'
import useSWR from 'swr'
import dayjs from 'dayjs'
import ErrorAlert from '@/components/ErrorAlert'
import { fetcher } from '@/lib/client'
import type { ReportView } from '@/lib/types'

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
        powerbi.embed(containerRef.current, {
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
                        <Input
                          placeholder="RLS 角色名（如 A院端）"
                          value={rlsRole}
                          onChange={(e) => setRlsRole(e.target.value)}
                          style={{ width: 200 }}
                        />
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
