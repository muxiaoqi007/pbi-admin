import '@ant-design/v5-patch-for-react-19'
import type { Metadata } from 'next'
import { AntdRegistry } from '@ant-design/nextjs-registry'
import RootShell from '@/components/RootShell'
import './globals.css'

export const metadata: Metadata = {
  title: 'Power BI 管理运维平台',
  description: '支持国际版与世纪互联的 Power BI 租户管理运维工具',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <AntdRegistry>
          <RootShell>{children}</RootShell>
        </AntdRegistry>
      </body>
    </html>
  )
}
