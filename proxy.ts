import { NextRequest, NextResponse } from 'next/server'

const SESSION_TTL_SECONDS = 7 * 24 * 3600

async function hmacHex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

async function hasValidSession(req: NextRequest, secret: string): Promise<boolean> {
  const token = req.cookies.get('pbi_admin_auth')?.value
  if (!token) return false
  const [expiresRaw, signature] = token.split('.', 2)
  const expiresAt = Number(expiresRaw)
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now() || !signature) return false
  // 拒绝异常超长会话，避免被构造出超出服务端策略的有效期。
  if (expiresAt > Date.now() + SESSION_TTL_SECONDS * 1000 + 60_000) return false
  const expected = await hmacHex(secret, expiresRaw)
  return safeEqual(signature, expected)
}

export async function proxy(req: NextRequest) {
  const pwd = process.env.PBI_ADMIN_PASSWORD

  // 管理后台在生产环境必须显式配置访问密码；开发环境仍允许本机无密码调试。
  if (!pwd) {
    if (process.env.NODE_ENV !== 'production') return NextResponse.next()
    const message = '生产环境未配置 PBI_ADMIN_PASSWORD，已拒绝访问。请设置管理密码后重新启动服务。'
    if (req.nextUrl.pathname.startsWith('/api')) {
      return NextResponse.json({ error: message }, { status: 503 })
    }
    return new NextResponse(message, {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  }

  if (await hasValidSession(req, pwd)) return NextResponse.next()

  if (req.nextUrl.pathname.startsWith('/api')) {
    return NextResponse.json({ error: '未登录或会话已过期，请刷新页面重新登录' }, { status: 401 })
  }
  const url = req.nextUrl.clone()
  url.pathname = '/login'
  url.search = ''
  return NextResponse.redirect(url)
}

export const config = {
  matcher: ['/((?!login|api/login|_next/static|_next/image|favicon\\.ico).*)'],
}
