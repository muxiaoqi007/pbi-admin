'use client'

import { useEffect, useState } from 'react'
import {
  Alert,
  App,
  Button,
  Collapse,
  Form,
  InputNumber,
  Modal,
  Radio,
  Select,
} from 'antd'
import useSWR from 'swr'
import { fetcher, postJSON } from '@/lib/client'
import type { DatasetView, PbiTable } from '@/lib/types'

export interface RefreshFormValues {
  mode: 'all' | 'tables'
  tables: string[]
  type: 'full' | 'automatic'
  commitMode: 'transactional' | 'partialBatch'
  maxParallelism: number
  retryCount: number
}

/** 触发刷新弹窗：全部刷新（经典）或选表刷新（增强刷新） */
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

  useEffect(() => {
    if (open) {
      form.setFieldsValue({
        mode: 'all',
        tables: [],
        type: 'full',
        commitMode: 'transactional',
        maxParallelism: 1,
        retryCount: 0,
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
              { value: 'all', label: '全部刷新' },
              { value: 'tables', label: '选表刷新' },
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
                placeholder={
                  tables.length > 0
                    ? '从下拉中选择，或输入表名'
                    : '例如：Sales、DimCustomer'
                }
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
                description="Power BI 的表清单接口（/tables）仅对推送数据集开放，普通数据集请手动输入表名后回车。表名可在 Power BI Desktop 的模型视图中确认，多个表逐个输入即可。"
              />
            )}
          </>
        )}

        <Collapse
          ghost
          items={[
            {
              key: 'advanced',
              label: '高级选项（增强刷新参数）',
              children: (
                <>
                  <Form.Item name="type" label="处理类型" initialValue="full">
                    <Select
                      options={[
                        { value: 'full', label: 'full — 全量处理' },
                        { value: 'automatic', label: 'automatic — 仅处理需要的分区' },
                      ]}
                    />
                  </Form.Item>
                  <Form.Item name="commitMode" label="提交模式" initialValue="transactional">
                    <Select
                      options={[
                        { value: 'transactional', label: 'transactional — 全部完成才提交' },
                        { value: 'partialBatch', label: 'partialBatch — 分批提交' },
                      ]}
                    />
                  </Form.Item>
                  <Form.Item name="maxParallelism" label="并行度" initialValue={1}>
                    <InputNumber min={1} max={30} style={{ width: '100%' }} />
                  </Form.Item>
                  <Form.Item name="retryCount" label="失败重试次数" initialValue={0}>
                    <InputNumber min={0} max={10} style={{ width: '100%' }} />
                  </Form.Item>
                </>
              ),
            },
          ]}
        />
      </Form>
    </Modal>
  )
}
