import { createHash, createHmac, timingSafeEqual } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const SESSION_TTL_SECONDS = 7 * 24 * 3600

/** 登录：校验 PBI_ADMIN_PASSWORD 并下发带过期时间的 HMAC 签名 HttpOnly cookie。 */
export async function POST(req: NextRequest) {
  const pwd = process.env.PBI_ADMIN_PASSWORD
  if (!pwd) {
    return NextResponse.json(
      {
        error:
          process.env.NODE_ENV === 'production'
            ? '生产环境必须设置 PBI_ADMIN_PASSWORD'
            : '本部署未启用密码保护（未设置 PBI_ADMIN_PASSWORD）',
      },
      { status: process.env.NODE_ENV === 'production' ? 503 : 400 },
    )
  }

  const body = (await req.json().catch(() => ({}))) as { password?: unknown }
  const supplied = typeof body.password === 'string' ? body.password : ''
  const expectedDigest = createHash('sha256').update(pwd).digest()
  const suppliedDigest = createHash('sha256').update(supplied).digest()
  if (!supplied || !timingSafeEqual(suppliedDigest, expectedDigest)) {
    return NextResponse.json({ error: '密码错误' }, { status: 401 })
  }

  const expiresAt = Date.now() + SESSION_TTL_SECONDS * 1000
  const expiresRaw = String(expiresAt)
  const signature = createHmac('sha256', pwd).update(expiresRaw).digest('hex')
  const res = NextResponse.json({ ok: true })
  res.cookies.set('pbi_admin_auth', `${expiresRaw}.${signature}`, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
    secure: process.env.NODE_ENV === 'production',
  })
  return res
}
