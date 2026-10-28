'use client'

import Link from 'next/link'
import { Space, Table, Tag } from 'antd'
import dayjs from 'dayjs'
import ErrorText from '@/components/ErrorText'
import TableEmpty from '@/components/TableEmpty'
import type { RefreshFailureItem } from '@/lib/types'

/** 刷新失败巡检列表：成员模式、无 Admin refreshables 时也可用。 */
export default function RefreshFailureTable({
  failures,
  loading,
  partial,
  noHistory = 0,
  filtered = false,
  page = 1,
  pageSize = 10,
  onPageChange,
}: {
  failures: RefreshFailureItem[]
  loading?: boolean
  partial?: boolean
  noHistory?: number
  filtered?: boolean
  page?: number
  pageSize?: number
  onPageChange?: (page: number, pageSize: number) => void
}) {
  return (
    <Table<RefreshFailureItem>
      rowKey={(item) => `${item.workspaceId}:${item.datasetId}`}
      size="small"
      loading={loading}
      dataSource={failures}
      scroll={{ x: 900 }}
      locale={{
        emptyText: (
          <TableEmpty
            title={
              partial
                ? '巡检未完成，无法确认没有失败'
                : filtered
                  ? '没有匹配的失败项'
                  : '当前没有刷新失败'
            }
            description={
              partial
                ? '部分数据集未能检查，请稍后重新巡检后再判断。'
                : filtered
                  ? '调整搜索关键词后再试。'
                  : noHistory > 0
                    ? `未发现明确失败，但另有 ${noHistory} 个可刷新数据集没有任何刷新记录。`
                    : '本次巡检已完成，未发现最近一次刷新失败的数据集。'
            }
          />
        ),
      }}
      pagination={{
        current: page,
        pageSize,
        showSizeChanger: true,
        showTotal: (total) => `共 ${total} 项`,
        onChange: (nextPage, nextSize) => onPageChange?.(nextPage, nextSize),
      }}
      columns={[
        {
          title: '问题',
          width: 150,
          render: (_: unknown, item) => {
            const ageDays = dayjs().diff(dayjs(item.startTime), 'day')
            return (
              <Space size={4} wrap>
                <Tag color="red">刷新失败</Tag>
                {ageDays > 30 && <Tag>陈旧 {ageDays} 天</Tag>}
              </Space>
            )
          },
        },
        { title: '数据集', dataIndex: 'datasetName', ellipsis: true },
        { title: '工作区', dataIndex: 'workspaceName', width: 160, ellipsis: true },
        {
          title: '最近时间',
          dataIndex: 'startTime',
          width: 165,
          render: (value?: string) => (value ? dayjs(value).format('YYYY-MM-DD HH:mm:ss') : '-'),
        },
        {
          title: '类型',
          dataIndex: 'refreshType',
          width: 100,
          render: (value?: string) => value ?? '-',
        },
        {
          title: '错误',
          dataIndex: 'error',
          ellipsis: { showTitle: false },
          render: (value?: string) => <ErrorText text={value} />,
        },
        {
          title: '定位',
          width: 150,
          fixed: 'right',
          render: (_: unknown, item) => (
            <Space size={4}>
              <Link href={`/datasets?q=${encodeURIComponent(item.datasetName)}`}>数据集</Link>
              <Link href={`/workspaces/${item.workspaceId}`}>工作区</Link>
            </Space>
          ),
        },
      ]}
    />
  )
}
