'use client'

import { Alert, Button, Space } from 'antd'
import Link from 'next/link'

/** 统一的页面级错误提示：显示错误信息 + 重试 + 跳转设置 */
export default function ErrorAlert({
  error,
  onRetry,
}: {
  error: unknown
  onRetry?: () => void
}) {
  const message = error instanceof Error ? error.message : String(error)
  const needSetup = message.includes('尚未配置')
  return (
    <Alert
      type="error"
      showIcon
      message="加载失败"
      description={message}
      action={
        <Space direction="vertical">
          {onRetry && (
            <Button size="small" danger onClick={onRetry}>
              重试
            </Button>
          )}
          {needSetup && (
            <Link href="/settings">
              <Button size="small" type="primary">
                前往设置
              </Button>
            </Link>
          )}
        </Space>
      }
      style={{ marginBottom: 16 }}
    />
  )
}
