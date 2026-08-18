'use client'

import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useState } from 'react'
import {
  App as AntApp,
  Button,
  ConfigProvider,
  Layout,
  Menu,
  Select,
  Tag,
  Tooltip,
  theme,
} from 'antd'
import {
  ApiOutlined,
  BarChartOutlined,
  DashboardOutlined,
  DatabaseOutlined,
  PartitionOutlined,
  SettingOutlined,
} from '@ant-design/icons'
import useSWR from 'swr'
import zhCN from 'antd/locale/zh_CN'
import dayjs from 'dayjs'
import 'dayjs/locale/zh-cn'
import { fetcher, postJSON } from '@/lib/client'
import type { CloudEnv } from '@/lib/types'

dayjs.locale('zh-cn')

const { Sider, Content, Header } = Layout

const MENU_ITEMS = [
  { key: '/', icon: <DashboardOutlined />, label: '总览' },
  { key: '/workspaces', icon: <PartitionOutlined />, label: '工作区' },
  { key: '/reports', icon: <BarChartOutlined />, label: '报表' },
  { key: '/datasets', icon: <DatabaseOutlined />, label: '数据集' },
  { key: '/datasources', icon: <ApiOutlined />, label: '数据源' },
  { key: '/settings', icon: <SettingOutlined />, label: '设置' },
]

export default function RootShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [collapsed, setCollapsed] = useState(false)
  const [switchingEnvId, setSwitchingEnvId] = useState<string | null>(null)
  const [switchEnvError, setSwitchEnvError] = useState<string | null>(null)
  const isLogin = pathname === '/login'

  const { data: configData } = useSWR<{
    activeEnvId?: string
    environments: { id: string; name: string; cloud: CloudEnv }[]
  }>(pathname === '/settings' || isLogin ? null : '/api/config', fetcher)
  const envs = configData?.environments ?? []
  const activeEnvId = configData?.activeEnvId

  async function switchEnv(id: string) {
    if (id === activeEnvId || switchingEnvId) return
    setSwitchingEnvId(id)
    setSwitchEnvError(null)
    try {
      await postJSON('/api/config', { action: 'activate', id })
      window.location.reload()
    } catch (error) {
      setSwitchEnvError(error instanceof Error ? error.message : String(error))
      setSwitchingEnvId(null)
    }
  }

  const selectedKey =
    MENU_ITEMS.map((i) => i.key)
      .filter((k) => k !== '/' && pathname.startsWith(k))
      .sort((a, b) => b.length - a.length)[0] ?? '/'

  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: { colorPrimary: '#e8ad03' },
        algorithm: theme.defaultAlgorithm,
      }}
    >
      <AntApp>
        {isLogin ? (
          children
        ) : (
          <Layout style={{ minHeight: '100vh' }}>
            <Header
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                background: '#001529',
                paddingInline: 16,
              }}
            >
              <Link href="/" style={{ color: '#fff', fontSize: 17, fontWeight: 600, whiteSpace: 'nowrap' }}>
                Power BI 管理运维平台
              </Link>
              <span className="header-subtitle" style={{ color: 'rgba(255,255,255,0.55)', fontSize: 12 }}>
                国际版 / 世纪互联
              </span>
              <div style={{ flex: 1 }} />
              {switchEnvError && (
                <Tooltip title={switchEnvError}>
                  <Tag
                    color="error"
                    closable
                    onClose={() => setSwitchEnvError(null)}
                    style={{ marginInlineEnd: 0 }}
                  >
                    环境切换失败
                  </Tag>
                </Tooltip>
              )}
              {envs.length > 0 ? (
                <Select
                  aria-label="当前 Power BI 环境"
                  size="small"
                  value={activeEnvId}
                  onChange={switchEnv}
                  loading={Boolean(switchingEnvId)}
                  disabled={Boolean(switchingEnvId)}
                  style={{ width: 220 }}
                  popupMatchSelectWidth={false}
                  options={envs.map((e) => ({
                    value: e.id,
                    label: `${e.name}（${e.cloud === 'china' ? '世纪互联' : '国际版'}）`,
                  }))}
                />
              ) : pathname !== '/settings' && configData ? (
                <Link href="/settings">
                  <Button size="small">配置环境</Button>
                </Link>
              ) : null}
            </Header>
            <Layout>
              <Sider
                collapsible
                collapsed={collapsed}
                onCollapse={setCollapsed}
                width={180}
                theme="dark"
              >
                <Menu
                  mode="inline"
                  theme="dark"
                  selectedKeys={[selectedKey]}
                  items={MENU_ITEMS}
                  onClick={({ key }) => router.push(key)}
                  style={{ height: '100%', borderRight: 0, paddingTop: 8 }}
                />
              </Sider>
              <Content className="page-content">{children}</Content>
            </Layout>
          </Layout>
        )}
      </AntApp>
    </ConfigProvider>
  )
}
