import { Space, Typography } from 'antd'

export default function PageHeader({
  title,
  description,
  actions,
  meta,
}: {
  title: string
  description?: React.ReactNode
  actions?: React.ReactNode
  meta?: React.ReactNode
}) {
  return (
    <div className="page-header">
      <div className="page-header-main">
        <Typography.Title level={3} className="page-title">
          {title}
        </Typography.Title>
        {description ? <div className="page-description">{description}</div> : null}
        {meta ? <div className="page-meta">{meta}</div> : null}
      </div>
      {actions ? (
        <Space wrap className="page-actions">
          {actions}
        </Space>
      ) : null}
    </div>
  )
}
