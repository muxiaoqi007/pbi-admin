'use client'

import { Alert, Button } from 'antd'

export default function StaleDataAlert({
  error,
  onRetry,
  message = '最新数据刷新失败，当前仍显示上一次成功加载的数据',
}: {
  error: unknown
  onRetry?: () => void
  message?: string
}) {
  const detail = error instanceof Error ? error.message : String(error)
  return (
    <Alert
      type="warning"
      showIcon
      message={message}
      description={detail}
      action={
        onRetry ? (
          <Button size="small" onClick={onRetry}>
            重试
          </Button>
        ) : undefined
      }
      style={{ marginBottom: 12 }}
    />
  )
}
