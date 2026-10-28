'use client'

import { Typography } from 'antd'

/** 表格里的长错误：可聚焦、悬浮查看全文，并提供复制按钮。 */
export default function ErrorText({
  text,
  empty = '-',
}: {
  text?: string
  empty?: React.ReactNode
}) {
  if (!text) return <>{empty}</>
  return (
    <Typography.Text
      type="danger"
      ellipsis={{ tooltip: text }}
      copyable={{ text }}
      tabIndex={0}
      aria-label={text}
      style={{ maxWidth: '100%' }}
    >
      {text}
    </Typography.Text>
  )
}
