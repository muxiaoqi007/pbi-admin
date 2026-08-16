'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { App, Button, Card, Form, Input } from 'antd'

export default function LoginPage() {
  const { message } = App.useApp()
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function submit(values: { password: string }) {
    setLoading(true)
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: values.password }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        message.error(data.error ?? '登录失败')
        return
      }
      router.push('/')
      router.refresh()
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
      }}
    >
      <Card title="访问验证" style={{ width: 360 }}>
        <p className="text-muted" style={{ marginBottom: 16 }}>
          本工具已启用访问密码保护，请输入访问密码。
        </p>
        <Form layout="vertical" onFinish={submit}>
          <Form.Item name="password" label="访问密码" rules={[{ required: true, message: '请输入密码' }]}>
            <Input.Password autoFocus />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={loading} block>
            进入
          </Button>
        </Form>
      </Card>
    </div>
  )
}
