'use client'

import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useState } from 'react'
import {
  App as AntApp,
  ConfigProvider,
  Layout,
  Menu,
  theme,
} from 'antd'
import {
  ApiOutlined,
  BarChartOutlined,
  DashboardOutlined,
  DatabaseOutlined,
  PartitionOutlined,
  SettingOutlined,
  ToolOutlined,
} from '@ant-design/icons'
import zhCN from 'antd/locale/zh_CN'
import dayjs from 'dayjs'
import 'dayjs/locale/zh-cn'

dayjs.locale('zh-cn')

const { Sider, Content, Header } = Layout

const MENU_ITEMS = [
  { key: '/', icon: <DashboardOutlined />, label: '总览' },
  { key: '/workspaces', icon: <PartitionOutlined />, label: '工作区' },
  { key: '/reports', icon: <BarChartOutlined />, label: '报表' },
  { key: '/datasets', icon: <DatabaseOutlined />, label: '数据集' },
  { key: '/datasources', icon: <ApiOutlined />, label: '数据源视角' },
  { key: '/tools', icon: <ToolOutlined />, label: '运维工具' },
  { key: '/settings', icon: <SettingOutlined />, label: '设置' },
]

export default function RootShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [collapsed, setCollapsed] = useState(false)

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
