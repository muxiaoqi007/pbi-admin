'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Alert } from 'antd'
import { useSnapshot } from '@/lib/use-snapshot'

/** 全站数据范围提示：成员模式下所有页面都能看到当前只覆盖哪些工作区。 */
export default function DataScopeBanner() {
  const pathname = usePathname()
  const { data: snapshot } = useSnapshot(pathname !== '/settings')

  if (pathname === '/settings' || !snapshot || snapshot.mode !== 'member') return null

  return (
    <Alert
      type="warning"
      showIcon
      banner
      style={{ marginBottom: 12 }}
      message={
        <span>
          成员模式：当前仅覆盖服务主体已加入的 {snapshot.workspaces.length} 个工作区。{' '}
          <Link href="/settings">检查权限</Link>
        </span>
      }
      description={
        snapshot.adminFallbackReason ? (
          <span className="text-muted">{snapshot.adminFallbackReason}</span>
        ) : undefined
      }
    />
  )
}
