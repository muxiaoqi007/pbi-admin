import { Empty } from 'antd'

export default function TableEmpty({
  title = '暂无数据',
  description,
}: {
  title?: string
  description?: string
}) {
  return (
    <Empty
      image={Empty.PRESENTED_IMAGE_SIMPLE}
      description={
        <div>
          <div style={{ color: 'rgba(0,0,0,0.65)', fontWeight: 500 }}>{title}</div>
          {description ? <div className="text-muted" style={{ marginTop: 4 }}>{description}</div> : null}
        </div>
      }
    />
  )
}
