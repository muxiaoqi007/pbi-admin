import { createHash, timingSafeEqual } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/** 登录：校验 PBI_ADMIN_PASSWORD 并下发 HttpOnly cookie（sha256 摘要） */
export async function POST(req: NextRequest) {
  const pwd = process.env.PBI_ADMIN_PASSWORD
  if (!pwd) {
    return NextResponse.json({ error: '本部署未启用密码保护（未设置 PBI_ADMIN_PASSWORD）' }, { status: 400 })
  }
  const body = (await req.json().catch(() => ({}))) as { password?: unknown }
  const supplied = typeof body.password === 'string' ? body.password : ''
  const expectedDigest = createHash('sha256').update(pwd).digest()
  const suppliedDigest = createHash('sha256').update(supplied).digest()
  if (!supplied || !timingSafeEqual(suppliedDigest, expectedDigest)) {
    return NextResponse.json({ error: '密码错误' }, { status: 401 })
  }
  const res = NextResponse.json({ ok: true })
  res.cookies.set('pbi_admin_auth', createHash('sha256').update(pwd).digest('hex'), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 3600,
    secure: process.env.NODE_ENV === 'production',
  })
  return res
}
