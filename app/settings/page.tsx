'use client'

import { useEffect, useState } from 'react'
import {
  Alert,
  App,
  Button,
  Card,
  Collapse,
  Descriptions,
  Form,
  Input,
  Radio,
  Space,
  Typography,
} from 'antd'
import useSWR from 'swr'
import { fetcher, postJSON } from '@/lib/client'
import { CLOUD_PRESETS } from '@/lib/cloud'
import type { CloudEnv } from '@/lib/types'

interface ConfigResponse {
  config: {
    cloud: CloudEnv
    tenantId: string
    clientId: string
    authorityOverride: string
    apiBaseOverride: string
    resourceOverride: string
    hasSecret: boolean
    secretPreview: string
  }
}

interface TestResult {
  ok: boolean
  tokenPreview: string
  mode?: 'admin' | 'member'
  workspaceCount: number
  reportCount: number
  datasetCount: number
  fetchedAt: string
}

export default function SettingsPage() {
  const { message } = App.useApp()
  const [form] = Form.useForm()
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<TestResult | null>(null)
  const [testError, setTestError] = useState<string | null>(null)

  const { data, mutate } = useSWR<ConfigResponse>('/api/config', fetcher)
  const cloudWatch = Form.useWatch('cloud', form) as CloudEnv | undefined
  const cloud: CloudEnv = cloudWatch ?? data?.config.cloud ?? 'global'
  const preset = CLOUD_PRESETS[cloud]

  useEffect(() => {
    if (data?.config) {
      const c = data.config
      form.setFieldsValue({
        cloud: c.cloud,
        tenantId: c.tenantId,
        clientId: c.clientId,
        clientSecret: '',
        authorityOverride: c.authorityOverride,
        apiBaseOverride: c.apiBaseOverride,
        resourceOverride: c.resourceOverride,
      })
    }
  }, [data, form])

  async function save() {
    const values = await form.validateFields()
    setSaving(true)
    try {
      await postJSON('/api/config', values)
      await mutate()
      setTestResult(null)
      setTestError(null)
      message.success('配置已保存')
    } catch (e) {
      message.error(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  async function test() {
    const values = await form.validateFields()
    setSaving(true)
    try {
      await postJSON('/api/config', values)
      await mutate()
      message.success('配置已保存，开始测试连接…')
    } catch (e) {
      message.error(e instanceof Error ? e.message : String(e))
      setSaving(false)
      return
    }
    setSaving(false)

    setTesting(true)
    setTestResult(null)
    setTestError(null)
    try {
      const result = await postJSON<TestResult>('/api/test')
      setTestResult(result)
    } catch (e) {
      setTestError(e instanceof Error ? e.message : String(e))
    } finally {
      setTesting(false)
    }
  }

  return (
    <Card title="连接设置" style={{ maxWidth: 780 }}>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="先在对应云的应用注册门户创建应用并获得管理员同意，详见 README 中的《应用注册步骤》。"
        description={
          <span>
            当前云的应用注册门户：
            <Typography.Link href={preset.portal} target="_blank">
              {preset.portal}
            </Typography.Link>
            ｜Power BI 服务：
            <Typography.Link href={preset.serviceUrl} target="_blank">
              {preset.serviceUrl}
            </Typography.Link>
          </span>
        }
      />

      <Form form={form} layout="vertical">
        <Form.Item name="cloud" label="云环境" rules={[{ required: true }]}>
          <Radio.Group
            optionType="button"
            buttonStyle="solid"
            onChange={() => {
              setTestResult(null)
              setTestError(null)
            }}
          >
            <Radio.Button value="global">国际版</Radio.Button>
            <Radio.Button value="china">世纪互联</Radio.Button>
          </Radio.Group>
        </Form.Item>

        <Space size="large" style={{ display: 'flex' }}>
          <Form.Item
            name="tenantId"
            label="租户 ID（或租户域名 xxx.partner.onmschina.cn / xxx.onmicrosoft.com）"
            rules={[{ required: true, message: '请填写租户 ID' }]}
            style={{ minWidth: 420 }}
          >
            <Input placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
          </Form.Item>
        </Space>

        <Form.Item
          name="clientId"
          label="客户端 ID（应用程序 ID）"
          rules={[{ required: true, message: '请填写客户端 ID' }]}
        >
          <Input placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
        </Form.Item>

        <Form.Item
          name="clientSecret"
          label={`客户端密钥${data?.config.hasSecret ? `（已保存 ${data.config.secretPreview}，留空表示不修改）` : ''}`}
          rules={[{ required: !data?.config.hasSecret, message: '请填写客户端密钥' }]}
        >
          <Input.Password placeholder={data?.config.hasSecret ? '留空保持不变' : '应用注册中创建的密钥值'} />
        </Form.Item>

        <Collapse
          ghost
          items={[
            {
              key: 'advanced',
              label: '高级设置（端点覆盖，一般留空）',
              children: (
                <>
                  <Form.Item name="authorityOverride" label="认证地址 Authority" initialValue="">
                    <Input placeholder={`默认 ${preset.authority}`} />
                  </Form.Item>
                  <Form.Item name="apiBaseOverride" label="API 基地址" initialValue="">
                    <Input placeholder={`默认 ${preset.apiBase}`} />
                  </Form.Item>
                  <Form.Item name="resourceOverride" label="Token Resource" initialValue="">
                    <Input placeholder={`默认 ${preset.resource}`} />
                  </Form.Item>
                </>
              ),
            },
          ]}
        />

        <Space style={{ marginTop: 8 }}>
          <Button type="primary" loading={saving} onClick={save}>
            保存配置
          </Button>
          <Button loading={testing} onClick={test}>
            保存并测试连接
          </Button>
        </Space>
      </Form>

      {testResult && (
        <Alert
          type="success"
          showIcon
          style={{ marginTop: 16 }}
          message="连接成功"
          description={
            <Descriptions column={2} size="small">
              <Descriptions.Item label="Token">{testResult.tokenPreview}</Descriptions.Item>
              <Descriptions.Item label="数据模式">
                {testResult.mode === 'member'
                  ? `成员模式（服务主体已加入的工作区）`
                  : '管理模式（全租户）'}
              </Descriptions.Item>
              <Descriptions.Item label="工作区数">{testResult.workspaceCount}</Descriptions.Item>
              <Descriptions.Item label="报表数">{testResult.reportCount}</Descriptions.Item>
              <Descriptions.Item label="数据集数">{testResult.datasetCount}</Descriptions.Item>
              <Descriptions.Item label="快照时间">
                {new Date(testResult.fetchedAt).toLocaleString()}
              </Descriptions.Item>
            </Descriptions>
          }
        />
      )}
      {testError && (
        <Alert
          type="error"
          showIcon
          style={{ marginTop: 16 }}
          message="连接失败"
          description={testError}
        />
      )}
    </Card>
  )
}
