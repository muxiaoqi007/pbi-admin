'use client'

import { useEffect, useState } from 'react'
import {
  Alert,
  App,
  Button,
  Collapse,
  DatePicker,
  Form,
  InputNumber,
  Modal,
  Radio,
  Select,
  Switch,
} from 'antd'
import useSWR from 'swr'
import type { Dayjs } from 'dayjs'
import { fetcher, postJSON } from '@/lib/client'
import type { DatasetView, PbiTable } from '@/lib/types'

export interface RefreshFormValues {
  mode: 'all' | 'allEnhanced' | 'tables'
  tables: string[]
  type: string
  commitMode: 'transactional' | 'partialBatch'
  maxParallelism: number
  retryCount: number
  ignoreRefreshPolicy: boolean
  effectiveDate: Dayjs | null
}

const TYPE_OPTIONS = [
  { value: 'full', label: 'full — 完全处理（默认）' },
  { value: 'automatic', label: 'automatic — 自动检测需处理的分区' },
  { value: 'dataOnly', label: 'dataOnly — 仅刷新数据，不重算依赖' },
  { value: 'calculate', label: 'calculate — 仅重算/聚合' },
  { value: 'clearValues', label: 'clearValues — 清除表数据' },
  { value: 'defragment', label: 'defragment — 碎片整理' },
]

/** 触发刷新弹窗：全部（经典）/ 全部（增强）/ 选表，支持处理类型、增量策略等增强参数 */
export default function RefreshModal({
  open,
  onClose,
  dataset,
  onTriggered,
}: {
  open: boolean
  onClose: () => void
  dataset: DatasetView | null
  onTriggered?: () => void
}) {
  const { message } = App.useApp()
  const [form] = Form.useForm<RefreshFormValues>()
  const [submitting, setSubmitting] = useState(false)
  const mode = Form.useWatch('mode', form)
  const enhanced = mode !== 'all'

  useEffect(() => {
    if (open) {
      form.setFieldsValue({
        mode: 'all',
        tables: [],
        type: 'full',
        commitMode: 'transactional',
        maxParallelism: 1,
        retryCount: 0,
        ignoreRefreshPolicy: false,
        effectiveDate: null,
      })
    }
  }, [open, form])

  const { data, error, isLoading } = useSWR<{ tables: PbiTable[] }>(
    open && dataset ? `/api/datasets/tables?wid=${dataset.workspaceId}&did=${dataset.id}` : null,
    fetcher,
  )

  const tables = data?.tables ?? []

  async function submit() {
    if (!dataset) return
    const values = await form.validateFields()
    setSubmitting(true)
    try {
      await postJSON('/api/refresh', {
        workspaceId: dataset.workspaceId,
        datasetId: dataset.id,
        mode: values.mode,
        tables: values.mode === 'tables' ? values.tables : undefined,
        type: values.type,
        commitMode: values.commitMode,
        maxParallelism: values.maxParallelism,
        retryCount: values.retryCount,
        applyRefreshPolicy: values.ignoreRefreshPolicy ? false : undefined,
        effectiveDate: values.effectiveDate
          ? values.effectiveDate.startOf('day').toISOString()
          : undefined,
      })
      message.success('刷新请求已提交，可在刷新记录中查看进度')
      onClose()
      onTriggered?.()
    } catch (e) {
      message.error(e instanceof Error ? e.message : String(e))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title={`立即刷新 — ${dataset?.name ?? ''}`}
      width={560}
      footer={[
        <Button key="cancel" onClick={onClose}>
          取消
        </Button>,
        <Button key="ok" type="primary" loading={submitting} onClick={submit}>
          开始刷新
        </Button>,
      ]}
    >
      <Form form={form} layout="vertical">
        <Form.Item name="mode" label="刷新方式" rules={[{ required: true }]}>
          <Radio.Group
            options={[
              { value: 'all', label: '全部（经典）' },
              { value: 'allEnhanced', label: '全部（增强）' },
              { value: 'tables', label: '选表' },
            ]}
            optionType="button"
            buttonStyle="solid"
          />
        </Form.Item>

        {mode === 'tables' && (
          <>
            <Form.Item
              name="tables"
              label={
                isLoading
                  ? '正在加载表清单…'
                  : tables.length > 0
                    ? '选择要刷新的表（也可手动输入）'
                    : '输入要刷新的表名（回车确认，可多个）'
              }
              rules={[{ required: true, message: '至少选择或输入一张表' }]}
            >
              <Select
                mode="tags"
                style={{ width: '100%' }}
                loading={isLoading}
                tokenSeparators={[',', ' ']}
                placeholder={tables.length > 0 ? '从下拉中选择，或输入表名' : '例如：Sales、DimCustomer'}
                options={tables.map((t) => ({
                  label: t.isHidden ? `${t.name}（隐藏表）` : t.name,
                  value: t.name,
                }))}
              />
            </Form.Item>
            {error && (
              <Alert
                type="info"
                showIcon
                style={{ marginBottom: 16 }}
                message="无法自动读取表清单"
                description="自动读取依次尝试 REST 表接口和 DAX 目录查询（INFO.VIEW.TABLES），均失败说明该数据集不支持或服务主体缺少 Build 权限。请手动输入表名后回车，表名可在 Power BI Desktop 的模型视图中确认。"
              />
            )}
          </>
        )}

        {enhanced && (
          <Form.Item name="type" label="处理类型" initialValue="full">
            <Select options={TYPE_OPTIONS} />
          </Form.Item>
        )}

        {enhanced && (
          <Collapse
            ghost
            items={[
              {
                key: 'advanced',
                label: '高级选项（增强刷新参数）',
                children: (
                  <>
                    <Form.Item name="commitMode" label="提交模式" initialValue="transactional">
                      <Select
                        options={[
                          { value: 'transactional', label: 'transactional — 全部完成才提交' },
                          { value: 'partialBatch', label: 'partialBatch — 分批提交（可中断续刷）' },
                        ]}
                      />
                    </Form.Item>
                    <Form.Item name="maxParallelism" label="并行度" initialValue={1}>
                      <InputNumber min={1} max={30} style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item name="retryCount" label="失败重试次数" initialValue={0}>
                      <InputNumber min={0} max={10} style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item
                      name="ignoreRefreshPolicy"
                      label="忽略增量刷新策略"
                      valuePropName="checked"
                      initialValue={false}
                      tooltip="开启后强制完整刷新整个数据集（applyRefreshPolicy=false），仅对配置了增量刷新的数据集有意义"
                    >
                      <Switch />
                    </Form.Item>
                    <Form.Item
                      name="effectiveDate"
                      label="增量刷新有效日期"
                      tooltip="把该日期当作“当前时间”来计算增量刷新窗口，可用于回补历史分区"
                    >
                      <DatePicker style={{ width: '100%' }} allowClear />
                    </Form.Item>
                  </>
                ),
              },
            ]}
          />
        )}

        {mode === 'all' && (
          <p className="text-muted" style={{ marginBottom: 0 }}>
            经典刷新兼容性最好；需要选表、指定处理类型或控制并行/重试时，请选择后两种增强模式。
          </p>
        )}
      </Form>
    </Modal>
  )
}
