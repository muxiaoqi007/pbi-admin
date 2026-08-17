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

/** GET锛氱幆澧冨垪琛紙鑴辨晱锛? 婵€娲荤幆澧?ID */
export async function GET() {
  try {
    const { environments, activeEnvId } = listEnvironments()
    return NextResponse.json({
      activeEnvId,
      environments: environments.map(maskEnvironment),
      activeEnv: environments.find((e) => e.id === activeEnvId)
        ? maskEnvironment(environments.find((e) => e.id === activeEnvId)!)
        : null,
    })
  } catch (e) {
    return fail(e)
  }
}

/** POST锛歿action: 'save'|'activate'|'delete', env?, id?, activate?} */
export async function POST(req: NextRequest) {
  try {
    const raw = await req.json().catch(() => null)
    if (!isPlainObject(raw)) {
      return NextResponse.json({ error: '璇锋眰浣撳繀椤绘槸 JSON 瀵硅薄' }, { status: 400 })
    }
    const body = raw as {
      action?: string
      env?: Partial<Environment> & { id?: string }
      id?: string
      activate?: boolean
   }
    if (body.action === 'save') {
      if (!isPlainObject(body.env)) {
        return NextResponse.json({ error: 'invalid environment config' }, { status: 400 })
      }
      const env = body.env
      if (env.id !== undefined && !isSafeId(env.id)) {
        return NextResponse.json({ error: 'invalid environment id' }, { status: 400 })
      }
      for (const [value, label] of [[env.authorityOverride, '璁よ瘉鍦板潃'], [env.apiBaseOverride, 'API 鍩哄湴鍧€'], [env.resourceOverride, 'Token Resource'], [env.xmlaEndpointOverride, 'XMLA 地址']] as const) {
        if (value !== undefined && value !== '' && !isSafePbiUrl(value)) {
          return NextResponse.json({ error: label + ' 蹇呴』鏄畨鍏ㄧ殑 HTTPS URL' }, { status: 400 })
        }
      }
    }
    if ((body.action === 'activate' || body.action === 'delete') && !isSafeId(body.id)) {
      return NextResponse.json({ error: 'invalid environment id' }, { status: 400 })
    }
    switch (body.action) {
      case 'save': {
        const saved = saveEnvironment(body.env ?? {})
        if (body.activate !== false) {
          setActiveEnvironment(saved.id)
        }
        invalidateToken()
        invalidatePbiCaches()
        break
      }
      case 'activate': {
        if (!body.id || !setActiveEnvironment(body.id)) {
          return NextResponse.json({ error: 'environment not found' }, { status: 404 })
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
        return NextResponse.json({ error: '鏈煡鎿嶄綔' }, { status: 400 })
    }
    const { environments, activeEnvId } = listEnvironments()
    return NextResponse.json({
      ok: true,
      activeEnvId,
      environments: environments.map(maskEnvironment),
      activeEnv: environments.find((e) => e.id === activeEnvId)
        ? maskEnvironment(environments.find((e) => e.id === activeEnvId)!)
        : null,
    })
  } catch (e) {
    return fail(e)
  }
}

