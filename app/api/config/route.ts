import { NextRequest, NextResponse } from 'next/server'
import { invalidateToken } from '@/lib/auth'
import { fail } from '@/lib/api'
import {
  deleteEnvironment,
  listEnvironments,
  maskEnvironment,
  saveEnvironment,
  setActiveEnvironment,
  type Environment,
} from '@/lib/config'
import { isPlainObject, isSafeId, isSafePbiUrl } from '@/lib/validation'
import { invalidatePbiCaches } from '@/lib/pbi'

export const dynamic = 'force-dynamic'

/** GET：返回脱敏后的环境列表与当前激活环境。 */
export async function GET() {
  try {
    const { environments, activeEnvId } = listEnvironments()
    const active = environments.find((e) => e.id === activeEnvId)
    return NextResponse.json({
      activeEnvId,
      environments: environments.map(maskEnvironment),
      activeEnv: active ? maskEnvironment(active) : null,
    })
  } catch (e) {
    return fail(e)
  }
}

/** POST：{action: 'save'|'activate'|'delete', env?, id?, activate?} */
export async function POST(req: NextRequest) {
  try {
    const raw = await req.json().catch(() => null)
    if (!isPlainObject(raw)) {
      return NextResponse.json({ error: '请求体必须是 JSON 对象' }, { status: 400 })
    }

    const body = raw as {
      action?: string
      env?: Partial<Environment> & { id?: string }
      id?: string
      activate?: boolean
    }

    if (body.action === 'save') {
      if (!isPlainObject(body.env)) {
        return NextResponse.json({ error: '环境配置格式无效' }, { status: 400 })
      }
      const env = body.env
      if (env.id !== undefined && !isSafeId(env.id)) {
        return NextResponse.json({ error: '环境 ID 格式无效' }, { status: 400 })
      }
      for (const [value, label] of [
        [env.authorityOverride, '认证地址'],
        [env.apiBaseOverride, 'API 基地址'],
        [env.resourceOverride, 'Token Resource'],
        [env.xmlaEndpointOverride, 'XMLA 地址'],
      ] as const) {
        if (value !== undefined && value !== '' && !isSafePbiUrl(value)) {
          return NextResponse.json(
            { error: `${label} 必须是允许的安全 HTTPS Power BI/Microsoft URL` },
            { status: 400 },
          )
        }
      }
    }

    if ((body.action === 'activate' || body.action === 'delete') && !isSafeId(body.id)) {
      return NextResponse.json({ error: '环境 ID 格式无效' }, { status: 400 })
    }

    switch (body.action) {
      case 'save': {
        const saved = saveEnvironment(body.env ?? {})
        if (body.activate !== false) setActiveEnvironment(saved.id)
        invalidateToken()
        invalidatePbiCaches()
        break
      }
      case 'activate': {
        if (!body.id || !setActiveEnvironment(body.id)) {
          return NextResponse.json({ error: '未找到指定环境' }, { status: 404 })
        }
        invalidateToken()
        invalidatePbiCaches()
        break
      }
      case 'delete': {
        if (body.id) deleteEnvironment(body.id)
        invalidateToken()
        invalidatePbiCaches()
        break
      }
      default:
        return NextResponse.json({ error: '未知操作' }, { status: 400 })
    }

    const { environments, activeEnvId } = listEnvironments()
    const active = environments.find((e) => e.id === activeEnvId)
    return NextResponse.json({
      ok: true,
      activeEnvId,
      environments: environments.map(maskEnvironment),
      activeEnv: active ? maskEnvironment(active) : null,
    })
  } catch (e) {
    return fail(e)
  }
}
