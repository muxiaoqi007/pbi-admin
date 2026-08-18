'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Alert, App, Button, Card, Form, Input } from 'antd'

function safeReturnPath() {
  const raw = new URLSearchParams(window.location.search).get('next')
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/'
  return raw
}

export default function LoginPage() {
  const { message } = App.useApp()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  async function submit(values: { password: string }) {
    setLoading(true)
    setSubmitError(null)
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: values.password }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        const error = data.error ?? '登录失败'
        setSubmitError(error)
        message.error(error)
        return
      }
      const target = safeReturnPath()
      router.replace(target)
      router.refresh()
    } catch (error) {
      const text = error instanceof Error ? error.message : '登录请求失败，请检查网络后重试'
      setSubmitError(text)
      message.error(text)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        minHeight: '80vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <Card title="访问验证" style={{ width: 380, maxWidth: '100%' }}>
        <p className="text-muted" style={{ marginBottom: 16 }}>
          本工具已启用访问密码保护，请输入访问密码。登录后会自动返回刚才访问的页面。
        </p>
        {submitError && (
          <Alert
            type="error"
            showIcon
            message="登录失败"
            description={submitError}
            style={{ marginBottom: 16 }}
          />
        )}
        <Form layout="vertical" onFinish={submit} disabled={loading}>
          <Form.Item name="password" label="访问密码" rules={[{ required: true, message: '请输入密码' }]}>
            <Input.Password autoFocus autoComplete="current-password" />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={loading} block>
            {loading ? '正在验证…' : '进入'}
          </Button>
        </Form>
      </Card>
    </div>
  )
}
