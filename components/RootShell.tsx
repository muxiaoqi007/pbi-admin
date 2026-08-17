'use client'

import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useState } from 'react'
import {
  App as AntApp,
  ConfigProvider,
  Layout,
  Menu,
  Select,
  theme,
} from 'antd'
import {
  ApiOutlined,
  BarChartOutlined,
  DashboardOutlined,
  DatabaseOutlined,
  ApartmentOutlined,
  PartitionOutlined,
  SettingOutlined,
  ToolOutlined,
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
  { key: '/models', icon: <ApartmentOutlined />, label: '数据模型' },
  { key: '/datasources', icon: <ApiOutlined />, label: '数据源视角' },
  { key: '/tools', icon: <ToolOutlined />, label: '运维工具' },
  { key: '/settings', icon: <SettingOutlined />, label: '设置' },
]

export default function RootShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [collapsed, setCollapsed] = useState(false)

  const { data: configData } = useSWR<{
    activeEnvId?: string
    environments: { id: string; name: string; cloud: CloudEnv }[]
  }>(pathname === '/settings' ? null : '/api/config', fetcher)
  const envs = configData?.environments ?? []
  const activeEnvId = configData?.activeEnvId

  async function switchEnv(id: string) {
    if (id === activeEnvId) return
    try {
      await postJSON('/api/config', { action: 'activate', id })
      window.location.reload()
    } catch {
      /* 切换失败时静默 */
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
            <Link href="/" style={{ color: '#fff', fontSize: 17, fontWeight: 600 }}>
              Power BI 管理运维平台
            </Link>
            <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: 12 }}>
              国际版 / 世纪互联
            </span>
            <div style={{ flex: 1 }} />
            {envs.length > 1 && (
              <Select
                size="small"
                value={activeEnvId}
                onChange={switchEnv}
                style={{ width: 200 }}
                popupMatchSelectWidth={false}
                options={envs.map((e) => ({
                  value: e.id,
                  label: `${e.name}（${e.cloud === 'china' ? '世纪互联' : '国际版'}）`,
                }))}
              />
            )}
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
      </AntApp>
    </ConfigProvider>
  )
}
