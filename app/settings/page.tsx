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
import {
  CheckCircleOutlined,
  CloudServerOutlined,
  LockOutlined,
  PlusOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons'
import useSWR from 'swr'
import PageHeader from '@/components/PageHeader'
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
  xmlaEndpointOverride: string
  hasSecret: boolean
  secretPreview: string
  hasPassword: boolean
  passwordPreview: string
  source: 'managed' | 'environmentVariables'
  readOnly: boolean
}

interface ConfigSecurity {
  production: boolean
  encryptionConfigured: boolean
  credentialPersistence: 'encrypted' | 'blocked' | 'developmentPlaintext'
}

interface ConfigResponse {
  activeEnvId?: string
  environments: MaskedEnv[]
  activeEnv: MaskedEnv | null
  security: ConfigSecurity
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
  xmlaEndpointOverride: string
}

function authLabel(authType: MaskedEnv['authType']) {
  return authType === 'password' ? '账号密码（ROPC）' : '服务主体'
}

function ConnectionResult({ result }: { result: TestResult }) {
  return (
    <Alert
      type={result.mode === 'member' ? 'warning' : 'success'}
      showIcon
      message={result.mode === 'member' ? '连接成功，当前为成员模式' : '连接成功，租户管理模式可用'}
      description={
        <Descriptions column={1} size="small" style={{ marginTop: 8 }}>
          <Descriptions.Item label="Token">
            {result.tokenAcquired ? '已获取（令牌内容不会显示）' : '未获取'}
          </Descriptions.Item>
          <Descriptions.Item label="数据范围">
            {result.mode === 'member' ? '服务主体已加入的工作区' : '租户级管理范围'}
          </Descriptions.Item>
          {result.mode === 'member' && result.adminFallbackReason && (
            <Descriptions.Item label="降级原因">{result.adminFallbackReason}</Descriptions.Item>
          )}
          <Descriptions.Item label="发现资源">
            {result.workspaceCount} 个工作区 · {result.reportCount} 张报表 · {result.datasetCount} 个数据集
          </Descriptions.Item>
          {result.diagnostics && (
            <Descriptions.Item label="API 诊断">
              <Space direction="vertical" size={4}>
                {result.diagnostics.endpoints.map((endpoint) => (
                  <span key={endpoint.path}>
                    {endpoint.path.startsWith('/admin/') ? '租户 Admin API' : '普通工作区 API'}：HTTP{' '}
                    {endpoint.status ?? '无法请求'} ·{' '}
                    {endpoint.ok ? '通过' : endpoint.errorCode || endpoint.detail || '失败'}
                    {endpoint.requestId ? ` · RequestId ${endpoint.requestId}` : ''}
                  </span>
                ))}
              </Space>
            </Descriptions.Item>
          )}
        </Descriptions>
      }
    />
  )
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
  const isReadOnly = Boolean(selectedEnv?.readOnly)
  const cloud = Form.useWatch('cloud', form) ?? selectedEnv?.cloud ?? 'global'
  const preset = CLOUD_PRESETS[cloud as CloudEnv] ?? CLOUD_PRESETS.global
  const authType = Form.useWatch('authType', form) ?? selectedEnv?.authType ?? 'servicePrincipal'

  useEffect(() => {
    if (!selectedId && data?.activeEnvId) setSelectedId(data.activeEnvId)
  }, [data?.activeEnvId, selectedId])

  useEffect(() => {
    if (!selectedId || !data) return
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
        xmlaEndpointOverride: '',
      })
    } else {
      const env = environments.find((e) => e.id === selectedId)
      if (env) {
        form.setFieldsValue({
          name: env.name,
          cloud: env.cloud,
          authType: env.authType,
          tenantId: env.tenantId,
          clientId: env.clientId,
          clientSecret: '',
          username: env.username,
          password: '',
          authorityOverride: env.authorityOverride,
          apiBaseOverride: env.apiBaseOverride,
          resourceOverride: env.resourceOverride,
          xmlaEndpointOverride: env.xmlaEndpointOverride,
        })
      }
    }
    setDirty(false)
    setTestResult(null)
    setTestError(null)
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
      content: '当前环境配置已经修改但尚未保存，切换后这些修改会丢失。',
      okText: '放弃并切换',
      cancelText: '继续编辑',
      okButtonProps: { danger: true },
      onOk: () => setSelectedId(nextId),
    })
  }

  async function runConnectionTest() {
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
      if (thenTest) await runConnectionTest()
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
      setSelectedId(id)
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

  const security = data?.security
  const securityAlert = security
    ? security.credentialPersistence === 'encrypted'
      ? {
          type: 'success' as const,
          message: '凭据持久化已启用加密保护',
          description: '页面保存的客户端密钥或密码会使用 PBI_CONFIG_ENCRYPTION_KEY 加密后写入配置文件。',
        }
      : security.credentialPersistence === 'blocked'
        ? {
            type: 'error' as const,
            message: '生产环境未配置凭据加密密钥',
            description:
              '当前仍可使用服务器环境变量托管凭据，但不能从页面保存包含密钥或密码的环境。请配置 PBI_CONFIG_ENCRYPTION_KEY 后重启服务。',
          }
        : {
            type: 'warning' as const,
            message: '开发模式未配置凭据加密',
            description: '本地开发允许明文保存配置；生产部署前应配置 PBI_CONFIG_ENCRYPTION_KEY。',
          }
    : null

  return (
    <div>
      <PageHeader
        title="环境管理"
        description="管理 Power BI 云环境、租户认证与连接端点。服务器环境变量托管的配置保持只读，页面托管环境可独立保存和切换。"
        meta={
          <Space size={6} wrap>
            <Tag>{environments.length} 个环境</Tag>
            {data?.activeEnv && <Tag color="blue">当前：{data.activeEnv.name}</Tag>}
          </Space>
        }
        actions={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => chooseEnvironment('new')}>
            新建环境
          </Button>
        }
      />

      {configError && (
        <Alert
          type="error"
          showIcon
          message="环境配置加载失败"
          description={configError instanceof Error ? configError.message : String(configError)}
          style={{ marginBottom: 16 }}
        />
      )}
      {securityAlert && <Alert showIcon {...securityAlert} style={{ marginBottom: 16 }} />}

      <div className="settings-layout">
        <Card title="环境列表" className="settings-env-list" loading={isLoading && !data}>
          <List
            dataSource={environments}
            locale={{ emptyText: '暂无环境，可从右上角创建第一个页面托管环境' }}
            renderItem={(env) => (
              <List.Item
                className={selectedId === env.id ? 'settings-env-item settings-env-item-active' : 'settings-env-item'}
                onClick={() => chooseEnvironment(env.id)}
                actions={
                  env.readOnly
                    ? []
                    : [
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
                          {env.id === activeEnvId ? '使用中' : '设为当前'}
                        </Button>,
                        <Popconfirm
                          key="delete"
                          title="确认删除该环境？"
                          description="删除后无法从页面恢复这套环境配置。"
                          okText="删除"
                          cancelText="取消"
                          okButtonProps={{ danger: true }}
                          onConfirm={(e) => {
                            e?.stopPropagation()
                            remove(env.id)
                          }}
                        >
                          <Button size="small" type="text" danger onClick={(e) => e.stopPropagation()}>
                            删除
                          </Button>
                        </Popconfirm>,
                      ]
                }
              >
                <List.Item.Meta
                  avatar={<CloudServerOutlined style={{ fontSize: 18, marginTop: 4 }} />}
                  title={
                    <Space size={6} wrap>
                      <span>{env.name}</span>
                      {env.id === activeEnvId && (
                        <Tag color="green" icon={<CheckCircleOutlined />}>
                          当前
                        </Tag>
                      )}
                      {env.readOnly && <Tag>服务器托管</Tag>}
                    </Space>
                  }
                  description={`${CLOUD_PRESETS[env.cloud]?.label ?? env.cloud} · ${authLabel(env.authType)}`}
                />
              </List.Item>
            )}
          />
        </Card>

        <div className="settings-editor">
          {!selectedId && !isLoading && (
            <Card>
              <Alert
                type="info"
                showIcon
                message="选择一个环境查看配置，或创建新的页面托管环境"
              />
            </Card>
          )}

          {selectedEnv?.readOnly && (
            <Card
              title={selectedEnv.name}
              extra={<Tag icon={<LockOutlined />}>只读 · 服务器环境变量</Tag>}
            >
              <Alert
                type="info"
                showIcon
                message="该环境由部署配置托管"
                description="页面不会修改、删除或覆盖服务器环境变量。需要变更租户、客户端或密钥时，请修改部署环境变量并重启服务。"
                style={{ marginBottom: 16 }}
              />
              <Descriptions column={{ xs: 1, lg: 2 }} bordered size="small">
                <Descriptions.Item label="云环境">
                  {CLOUD_PRESETS[selectedEnv.cloud]?.label ?? selectedEnv.cloud}
                </Descriptions.Item>
                <Descriptions.Item label="认证方式">{authLabel(selectedEnv.authType)}</Descriptions.Item>
                <Descriptions.Item label="租户">{selectedEnv.tenantId || '-'}</Descriptions.Item>
                <Descriptions.Item label="客户端 ID">{selectedEnv.clientId || '-'}</Descriptions.Item>
                <Descriptions.Item label="凭据状态">
                  {selectedEnv.hasSecret || selectedEnv.hasPassword ? <Tag color="green">已提供</Tag> : <Tag color="red">缺失</Tag>}
                </Descriptions.Item>
                <Descriptions.Item label="配置来源">服务器环境变量</Descriptions.Item>
              </Descriptions>
              <Space style={{ marginTop: 16 }} wrap>
                <Button type="primary" loading={testing} onClick={runConnectionTest}>
                  {testing ? '正在测试…' : '测试当前连接'}
                </Button>
                <Typography.Text type="secondary">
                  如需改为页面管理，可创建一个新的页面托管环境。
                </Typography.Text>
              </Space>
            </Card>
          )}

          {(isNew || (selectedEnv && !selectedEnv.readOnly)) && (
            <Card
              title={isNew ? '新建页面托管环境' : `编辑：${selectedEnv?.name}`}
              extra={dirty ? <Tag color="orange">有未保存更改</Tag> : <Tag color="green">已保存</Tag>}
            >
              {isNew && environments.some((env) => env.readOnly) && (
                <Alert
                  type="warning"
                  showIcon
                  message="创建后将切换为页面托管配置"
                  description="一旦保存页面托管环境，系统会优先使用 data/config.json 中的环境列表；服务器环境变量仍保留在部署侧，但不再作为页面中的当前环境。"
                  style={{ marginBottom: 16 }}
                />
              )}
              <Form form={form} layout="vertical" onValuesChange={() => setDirty(true)} disabled={saving || testing}>
                <Form.Item name="name" label="环境名称" rules={[{ required: true, message: '请填写环境名称' }]}>
                  <Input placeholder="如：世纪互联生产 / Global 测试" />
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
                    <Radio.Button value="password">账号密码（ROPC）</Radio.Button>
                  </Radio.Group>
                </Form.Item>
                <Form.Item name="tenantId" label="租户 ID / 域名" rules={[{ required: true, message: '请填写租户 ID' }]}>
                  <Input placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
                </Form.Item>
                <Form.Item name="clientId" label="客户端 ID" rules={[{ required: true, message: '请填写客户端 ID' }]}>
                  <Input placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
                </Form.Item>

                {authType === 'password' ? (
                  <>
                    <Form.Item name="username" label="用户名（UPN）" rules={[{ required: true, message: '请填写用户名' }]}>
                      <Input placeholder="admin@example.com" autoComplete="username" />
                    </Form.Item>
                    <Form.Item
                      name="password"
                      label={`密码${selectedEnv?.hasPassword ? `（${selectedEnv.passwordPreview}，留空保持不变）` : ''}`}
                      rules={[{ required: !selectedEnv?.hasPassword, message: '请填写密码' }]}
                    >
                      <Input.Password placeholder={selectedEnv?.hasPassword ? '留空保持原密码' : '账号密码'} autoComplete="new-password" />
                    </Form.Item>
                  </>
                ) : (
                  <Form.Item
                    name="clientSecret"
                    label={`客户端密钥${selectedEnv?.hasSecret ? `（${selectedEnv.secretPreview}，留空保持不变）` : ''}`}
                    rules={[{ required: !selectedEnv?.hasSecret, message: '请填写客户端密钥' }]}
                  >
                    <Input.Password placeholder={selectedEnv?.hasSecret ? '留空保持原密钥' : '应用注册中创建的 Secret Value'} autoComplete="new-password" />
                  </Form.Item>
                )}

                <Collapse
                  ghost
                  items={[
                    {
                      key: 'advanced',
                      label: '高级端点覆盖（一般留空）',
                      children: (
                        <>
                          <Alert
                            type="info"
                            showIcon
                            message="只有代理、私有云或特殊部署场景才需要覆盖默认端点。"
                            style={{ marginBottom: 12 }}
                          />
                          <Form.Item name="authorityOverride" label="认证地址 Authority">
                            <Input placeholder={`默认 ${preset.authority}`} />
                          </Form.Item>
                          <Form.Item name="apiBaseOverride" label="Power BI API 基地址">
                            <Input placeholder={`默认 ${preset.apiBase}`} />
                          </Form.Item>
                          <Form.Item name="resourceOverride" label="Token Resource">
                            <Input placeholder={`默认 ${preset.resource}`} />
                          </Form.Item>
                          <Form.Item name="xmlaEndpointOverride" label="XMLA Endpoint">
                            <Input placeholder="可选：自定义 XMLA 端点" />
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
                  <Typography.Link href={preset.portal} target="_blank">
                    打开当前云应用注册门户
                  </Typography.Link>
                </Space>
              </Form>
            </Card>
          )}

          {(testResult || testError) && (
            <Card title="连接测试" style={{ marginTop: 16 }}>
              {testResult && <ConnectionResult result={testResult} />}
              {testError && <Alert type="error" showIcon message="连接失败" description={testError} />}
            </Card>
          )}

          {security?.encryptionConfigured && (
            <Card size="small" style={{ marginTop: 16 }}>
              <Space>
                <SafetyCertificateOutlined />
                <Typography.Text type="secondary">页面托管凭据将以 AES-256-GCM 加密后持久化。</Typography.Text>
              </Space>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
