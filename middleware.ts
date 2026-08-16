import { NextRequest, NextResponse } from 'next/server'

/** 设置了 PBI_ADMIN_PASSWORD 环境变量后，全部页面与 API 需先登录（cookie = sha256(密码)） */

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export async function middleware(req: NextRequest) {
  const pwd = process.env.PBI_ADMIN_PASSWORD
  if (!pwd) return NextResponse.next()

  const expected = await sha256Hex(pwd)
  const token = req.cookies.get('pbi_admin_auth')?.value
  if (token === expected) return NextResponse.next()

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
