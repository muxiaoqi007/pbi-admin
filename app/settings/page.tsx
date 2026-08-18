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
  List,
  Popconfirm,
  Radio,
  Space,
  Tag,
  Typography,
} from 'antd'
import { CheckCircleOutlined, PlusOutlined } from '@ant-design/icons'
import useSWR from 'swr'
import { fetcher, postJSON } from '@/lib/client'
import { CLOUD_PRESETS } from '@/lib/cloud'
import type { CloudEnv } from '@/lib/types'

interface MaskedEnv {
  id: string
  name: string
  cloud: CloudEnv
  authType: 'servicePrincipal' | 'password'
  tenantId: string
  clientId: string
  username: string
  authorityOverride: string
  apiBaseOverride: string
  resourceOverride: string
  hasSecret: boolean
  secretPreview: string
  hasPassword: boolean
  passwordPreview: string
}

interface ConfigResponse {
  activeEnvId?: string
  environments: MaskedEnv[]
  activeEnv: MaskedEnv | null
}

interface TestResult {
  ok: boolean
  tokenAcquired: boolean
  mode?: 'admin' | 'member'
  adminFallbackReason?: string
  workspaceCount: number
  reportCount: number
  datasetCount: number
  fetchedAt: string
  diagnostics?: {
    token: {
      authType: string
      tokenVersion?: string
      audience?: string
      tenantId?: string
      clientId?: string
      roles: string[]
      scopes: string[]
    }
    endpoints: Array<{
      path: string
      status: number | null
      ok: boolean
      requestId?: string
      errorCode?: string
      detail?: string
    }>
  }
}

interface FormValues {
  name: string
  cloud: CloudEnv
  authType: 'servicePrincipal' | 'password'
  tenantId: string
  clientId: string
  clientSecret: string
  username: string
  password: string
  authorityOverride: string
  apiBaseOverride: string
  resourceOverride: string
}

export default function SettingsPage() {
  const { message, modal } = App.useApp()
  const [form] = Form.useForm<FormValues>()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [testResult, setTestResult] = useState<TestResult | null>(null)
  const [testError, setTestError] = useState<string | null>(null)

  const { data, mutate, error: configError, isLoading } = useSWR<ConfigResponse>('/api/config', fetcher)
  const environments = data?.environments ?? []
  const activeEnvId = data?.activeEnvId

  const selectedEnv = environments.find((e) => e.id === selectedId) ?? null
  const isNew = selectedId === 'new'
  const cloud = Form.useWatch('cloud', form) ?? selectedEnv?.cloud ?? 'global'
  const preset = CLOUD_PRESETS[cloud as CloudEnv] ?? CLOUD_PRESETS.global
  const authType = Form.useWatch('authType', form) ?? selectedEnv?.authType ?? 'servicePrincipal'

  useEffect(() => {
    if (!selectedId && data?.activeEnvId) setSelectedId(data.activeEnvId)
  }, [data?.activeEnvId, selectedId])

  useEffect(() => {
    if (selectedId && data) {
      if (selectedId === 'new') {
        form.setFieldsValue({
          name: '',
          cloud: 'china',
          authType: 'servicePrincipal',
          tenantId: '',
          clientId: '',
          clientSecret: '',
          username: '',
          password: '',
          authorityOverride: '',
          apiBaseOverride: '',
          resourceOverride: '',
        })
      } else {
        const env = environments.find((e) => e.id === selectedId)
        if (env) {
          form.setFieldsValue({
            name: env.name,
            cloud: env.cloud,
            authType: env.authType ?? 'servicePrincipal',
            tenantId: env.tenantId,
            clientId: env.clientId,
            clientSecret: '',
            username: env.username,
            password: '',
            authorityOverride: env.authorityOverride,
            apiBaseOverride: env.apiBaseOverride,
            resourceOverride: env.resourceOverride,
          })
        }
      }
      setDirty(false)
      setTestResult(null)
      setTestError(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, data])

  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  function chooseEnvironment(nextId: string) {
    if (nextId === selectedId) return
    if (!dirty) {
      setSelectedId(nextId)
      return
    }
    modal.confirm({
      title: '放弃未保存的更改？',
      content: '当前环境配置已经修改但尚未保存。切换后这些修改会丢失。',
      okText: '放弃并切换',
      cancelText: '继续编辑',
      okButtonProps: { danger: true },
      onOk: () => setSelectedId(nextId),
    })
  }

  async function persist(thenTest: boolean) {
    let values: FormValues
    try {
      values = await form.validateFields()
    } catch {
      return
    }

    setSaving(true)
    setTestResult(null)
    setTestError(null)
    try {
      const saved = await postJSON<ConfigResponse & { ok: boolean }>('/api/config', {
        action: 'save',
        env: { ...values, id: isNew ? undefined : selectedId },
      })
      await mutate(saved, { revalidate: false })
      setSelectedId(saved.activeEnvId ?? selectedId)
      setDirty(false)
      message.success('环境已保存并设为当前使用')

      if (thenTest) {
        setTesting(true)
        try {
          const result = await postJSON<TestResult>('/api/test')
          setTestResult(result)
        } catch (e) {
          setTestError(e instanceof Error ? e.message : String(e))
        } finally {
          setTesting(false)
        }
      }
    } catch (e) {
      message.error(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  async function activate(id: string) {
    try {
      const next = await postJSON<ConfigResponse & { ok: boolean }>('/api/config', { action: 'activate', id })
      await mutate(next, { revalidate: false })
      message.success('已切换当前环境')
    } catch (e) {
      message.error(e instanceof Error ? e.message : String(e))
    }
  }

  async function remove(id: string) {
    try {
      const next = await postJSON<ConfigResponse & { ok: boolean }>('/api/config', { action: 'delete', id })
      await mutate(next, { revalidate: false })
      if (selectedId === id) {
        setDirty(false)
        setSelectedId(next.activeEnvId ?? null)
      }
      message.success('环境已删除')
    } catch (e) {
      message.error(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="settings-layout">
      <Card
        title="租户环境"
        className="settings-env-list"
        loading={isLoading && !data}
        extra={
          <Button
            size="small"
            icon={<PlusOutlined />}
            onClick={() => chooseEnvironment('new')}
            type={isNew ? 'primary' : 'default'}
          >
            新建
          </Button>
        }
      >
        {configError && (
          <Alert
            type="error"
            showIcon
            message="环境配置加载失败"
            description={configError instanceof Error ? configError.message : String(configError)}
            style={{ marginBottom: 12 }}
          />
        )}
        <List
          dataSource={environments}
          locale={{ emptyText: '暂无环境，点右上角新建' }}
          renderItem={(env) => (
            <List.Item
              style={{
                cursor: 'pointer',
                padding: '10px 8px',
                borderRadius: 8,
                background: selectedId === env.id ? 'rgba(232,173,3,0.08)' : undefined,
                border:
                  selectedId === env.id ? '1px solid #e8ad03' : '1px solid transparent',
              }}
              onClick={() => chooseEnvironment(env.id)}
              actions={[
                <Button
                  key="use"
                  size="small"
                  type="link"
                  disabled={env.id === activeEnvId || saving || testing}
                  onClick={(e) => {
                    e.stopPropagation()
                    activate(env.id)
                  }}
                >
                  {env.id === activeEnvId ? '使用中' : '切换'}
                </Button>,
                <Popconfirm
                  key="del"
                  title={env.id === selectedId && dirty ? '该环境有未保存更改，确认删除？' : '确认删除该环境？'}
                  description="删除后无法从页面恢复该环境配置。"
                  okText="删除"
                  cancelText="取消"
                  okButtonProps={{ danger: true }}
                  onConfirm={(e) => {
                    e?.stopPropagation()
                    remove(env.id)
                  }}
                  onCancel={(e) => e?.stopPropagation()}
                >
                  <Button
                    size="small"
                    type="text"
                    danger
                    disabled={saving || testing}
                    onClick={(e) => e.stopPropagation()}
                  >
                    删除
                  </Button>
                </Popconfirm>,
              ]}
            >
              <List.Item.Meta
                title={
                  <Space>
                    <span>{env.name}</span>
                    {env.id === activeEnvId && (
                      <Tag color="green" icon={<CheckCircleOutlined />}>
                        当前
                      </Tag>
                    )}
                  </Space>
                }
                description={
                  <span className="text-muted">
                    {CLOUD_PRESETS[env.cloud]?.label ?? env.cloud} · {env.tenantId.slice(0, 18) || '未配置'}
                  </span>
                }
              />
            </List.Item>
          )}
        />
      </Card>

      <Card
        title={isNew ? '新建环境' : selectedEnv ? `编辑：${selectedEnv.name}` : '选择或新建一个环境'}
        className="settings-editor"
        extra={dirty ? <Tag color="orange">有未保存更改</Tag> : null}
      >
        {!selectedId && (
          <Alert
            type="info"
            showIcon
            message="从左侧选择一个环境编辑，或点「新建」添加"
            description="每个环境包含独立的云类型、租户、服务主体凭据。切换环境后所有页面的数据随之切换。"
          />
        )}
        {selectedId && (
          <Form form={form} layout="vertical" onValuesChange={() => setDirty(true)} disabled={saving || testing}>
            <Form.Item name="name" label="环境名称" rules={[{ required: true, message: '请填写名称' }]}>
              <Input placeholder="如：世纪互联生产 / 客户A国际版" />
            </Form.Item>
            <Form.Item name="cloud" label="云环境" rules={[{ required: true }]}>
              <Radio.Group optionType="button" buttonStyle="solid">
                <Radio.Button value="global">国际版</Radio.Button>
                <Radio.Button value="china">世纪互联</Radio.Button>
              </Radio.Group>
            </Form.Item>
            <Form.Item name="authType" label="认证方式" rules={[{ required: true }]}>
              <Radio.Group optionType="button" buttonStyle="solid">
                <Radio.Button value="servicePrincipal">服务主体（密钥）</Radio.Button>
                <Radio.Button value="password">账号密码</Radio.Button>
              </Radio.Group>
            </Form.Item>
            <Form.Item
              name="tenantId"
              label="租户 ID（或租户域名）"
              rules={[{ required: true, message: '请填写租户 ID' }]}
            >
              <Input placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
            </Form.Item>
            <Form.Item
              name="clientId"
              label="客户端 ID（应用程序 ID）"
              rules={[{ required: true, message: '请填写客户端 ID' }]}
            >
              <Input placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
            </Form.Item>
            {authType === 'password' ? (
              <>
                <Form.Item
                  name="username"
                  label="用户名（UPN 邮箱）"
                  rules={[{ required: true, message: '请填写用户名' }]}
                >
                  <Input placeholder="admin@xxx.partner.onmschina.cn" autoComplete="username" />
                </Form.Item>
                <Form.Item
                  name="password"
                  label={`密码${selectedEnv?.hasPassword ? `（${selectedEnv.passwordPreview}，留空不改）` : ''}`}
                  rules={[{ required: !selectedEnv?.hasPassword, message: '请填写密码' }]}
                >
                  <Input.Password
                    placeholder={selectedEnv?.hasPassword ? '留空保持不变' : '账号密码'}
                    autoComplete="new-password"
                  />
                </Form.Item>
              </>
            ) : (
              <Form.Item
                name="clientSecret"
                label={`客户端密钥${selectedEnv?.hasSecret ? `（已保存 ${selectedEnv.secretPreview}，留空不改）` : ''}`}
                rules={[{ required: !selectedEnv?.hasSecret, message: '请填写客户端密钥' }]}
              >
                <Input.Password
                  placeholder={selectedEnv?.hasSecret ? '留空保持不变' : '应用注册中创建的密钥值'}
                  autoComplete="new-password"
                />
              </Form.Item>
            )}
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
            <Space style={{ marginTop: 8 }} wrap>
              <Button type="primary" loading={saving && !testing} onClick={() => persist(false)}>
                保存并使用
              </Button>
              <Button loading={saving || testing} onClick={() => persist(true)}>
                {testing ? '正在测试连接…' : '保存并测试连接'}
              </Button>
            </Space>
            <p style={{ marginTop: 8 }} className="text-muted">
              当前云应用注册门户：
              <Typography.Link href={preset.portal} target="_blank">
                {preset.portal}
              </Typography.Link>
            </p>
          </Form>
        )}

        {testResult && (
          <Alert
            type={testResult.mode === 'member' ? 'warning' : 'success'}
            showIcon
            style={{ marginTop: 16 }}
            message={testResult.mode === 'member' ? '基础连接成功，但未启用租户 Admin API' : '连接成功'}
            description={
              <Descriptions column={1} size="small">
                <Descriptions.Item label="Token">
                  {testResult.tokenAcquired ? '已获取（不会显示令牌内容）' : '未获取'}
                </Descriptions.Item>
                <Descriptions.Item label="数据模式">
                  {testResult.mode === 'member' ? '成员模式（服务主体已加入的工作区）' : '管理模式（全租户）'}
                </Descriptions.Item>
                {testResult.mode === 'member' && testResult.adminFallbackReason && (
                  <Descriptions.Item label="降级原因">
                    {testResult.adminFallbackReason}
                  </Descriptions.Item>
                )}
                <Descriptions.Item label="工作区数">{testResult.workspaceCount}</Descriptions.Item>
                <Descriptions.Item label="报表数">{testResult.reportCount}</Descriptions.Item>
                <Descriptions.Item label="数据集数">{testResult.datasetCount}</Descriptions.Item>
                {testResult.diagnostics && (
                  <Descriptions.Item label="API 诊断">
                    <Space direction="vertical" size={4}>
                      <span>
                        Token：
                        {testResult.diagnostics.token.authType === 'service_principal'
                          ? '服务主体（client credentials）'
                          : testResult.diagnostics.token.authType}
                      </span>
                      {testResult.diagnostics.endpoints.map((endpoint) => (
                        <span key={endpoint.path}>
                          {endpoint.path.startsWith('/admin/') ? '租户 Admin API' : '普通工作区 API'}
                          ：HTTP {endpoint.status ?? '无法请求'}{' '}
                          {endpoint.ok ? '通过' : endpoint.errorCode || endpoint.detail || '失败'}
                          {endpoint.requestId ? `（RequestId: ${endpoint.requestId}）` : ''}
                        </span>
                      ))}
                      {testResult.diagnostics.token.authType === 'service_principal' &&
                        testResult.diagnostics.endpoints.some(
                          (endpoint) => endpoint.path.startsWith('/admin/') && endpoint.status === 401,
                        ) &&
                        testResult.diagnostics.token.roles.length > 0 && (
                          <Typography.Text type="warning">
                            当前服务主体令牌包含 Power BI 应用角色：
                            {testResult.diagnostics.token.roles.join(', ')}。服务主体调用只读 Admin API
                            时，Microsoft 要求不要在应用注册中配置需要管理员同意的 Power BI
                            权限，而应由 Fabric 管理门户的 Admin API 租户设置和安全组控制。
                          </Typography.Text>
                        )}
                    </Space>
                  </Descriptions.Item>
                )}
              </Descriptions>
            }
          />
        )}
        {testError && (
          <Alert type="error" showIcon style={{ marginTop: 16 }} message="连接失败" description={testError} />
        )}
      </Card>
    </div>
  )
}
