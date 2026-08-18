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
  Space,
  Switch,
  Tag,
} from 'antd'
import type { Dayjs } from 'dayjs'
import { postJSON } from '@/lib/client'
import { useDatasetTables } from '@/lib/use-dataset-tables'
import type { DatasetView } from '@/lib/types'

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
  const { message, modal } = App.useApp()
  const [form] = Form.useForm<RefreshFormValues>()
  const [submitting, setSubmitting] = useState(false)
  const mode = Form.useWatch('mode', form)
  const refreshType = Form.useWatch('type', form)
  const ignoreRefreshPolicy = Form.useWatch('ignoreRefreshPolicy', form)
  const enhanced = mode === 'allEnhanced' || mode === 'tables'

  useEffect(() => {
    if (open && dataset) {
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
  }, [open, dataset, form])

  const { tables, data, error, isLoading, addManualTables } = useDatasetTables(
    dataset?.workspaceId,
    dataset?.id,
    open && Boolean(dataset),
  )

  async function execute(values: RefreshFormValues) {
    if (!dataset) return
    // Only persist names typed by the user; API/cache options retain their original provenance.
    if (values.mode === 'tables' && values.tables?.length) {
      const known = new Set(tables.map((table) => table.name))
      addManualTables(values.tables.filter((name) => !known.has(name)))
    }
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
      message.success('刷新请求已提交，正在打开刷新记录')
      onClose()
      onTriggered?.()
    } catch (e) {
      message.error(e instanceof Error ? e.message : String(e))
    } finally {
      setSubmitting(false)
    }
  }

  async function submit() {
    if (!dataset || submitting) return
    let values: RefreshFormValues
    try {
      values = await form.validateFields()
    } catch {
      return
    }

    if (values.mode !== 'all' && values.type === 'clearValues') {
      modal.confirm({
        title: '确认执行 clearValues？',
        content:
          '该处理类型会清除目标模型对象中的数据值，不是普通刷新。请确认这是你明确需要的维护操作。',
        okText: '确认清除并提交',
        cancelText: '取消',
        okButtonProps: { danger: true },
        onOk: () => execute(values),
      })
      return
    }

    await execute(values)
  }

  return (
    <Modal
      open={open}
      onCancel={submitting ? undefined : onClose}
      closable={!submitting}
      maskClosable={!submitting}
      keyboard={!submitting}
      title={`立即刷新 — ${dataset?.name ?? ''}`}
      width={560}
      footer={[
        <Button key="cancel" onClick={onClose} disabled={submitting}>
          取消
        </Button>,
        <Button key="ok" type="primary" loading={submitting} onClick={submit}>
          {submitting ? '正在提交…' : '开始刷新'}
        </Button>,
      ]}
    >
      <Form form={form} layout="vertical" disabled={submitting}>
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
                notFoundContent={isLoading ? '正在读取表清单…' : '没有自动读取到表，可直接输入表名并按 Enter'}
                tokenSeparators={[',', ' ']}
                placeholder={tables.length > 0 ? '从下拉中选择，或输入表名' : '例如：Sales、DimCustomer'}
                options={tables.map((t) => ({
                  label: t.isHidden ? `${t.name}（隐藏表）` : t.name,
                  value: t.name,
                }))}
              />
            </Form.Item>
            {tables.length > 0 && (
              <Space wrap style={{ margin: '-8px 0 12px' }}>
                {data?.tables.length ? <Tag color="green">API 实时：{data.tables.length}</Tag> : null}
                {tables.some((table) => table.catalogSource === 'api-cache') ? <Tag color="blue">API 历史缓存</Tag> : null}
                {tables.some((table) => table.catalogSource === 'manual' || table.catalogSource === 'legacy') ? <Tag>手工/旧缓存</Tag> : null}
              </Space>
            )}
            {error && (
              <Alert
                type="warning"
                showIcon
                style={{ marginBottom: 16 }}
                message="无法自动读取表清单"
                description={
                  <>
                    <p style={{ margin: '4px 0' }}>{String(error.message ?? error)}</p>
                    <p style={{ margin: '4px 0' }} className="text-muted">
                      实时接口失败不代表下拉框为空：上方仍可能显示 API 历史缓存或手工录入项，并已明确标注来源。可继续手工输入表名。
                    </p>
                  </>
                }
              />
            )}
          </>
        )}

        {enhanced && (
          <Form.Item name="type" label="处理类型" initialValue="full">
            <Select options={TYPE_OPTIONS} />
          </Form.Item>
        )}

        {enhanced && refreshType === 'clearValues' && (
          <Alert
            type="error"
            showIcon
            message="clearValues 是破坏性处理类型"
            description="它会清除目标对象中的数据值。提交前系统还会再次要求确认。"
            style={{ marginBottom: 16 }}
          />
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
                    {ignoreRefreshPolicy && (
                      <Alert
                        type="warning"
                        showIcon
                        message="已忽略增量刷新策略"
                        description="本次请求将发送 applyRefreshPolicy=false，可能显著增加刷新范围和耗时。"
                        style={{ marginBottom: 16 }}
                      />
                    )}
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
