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

export const dynamic = 'force-dynamic'

/** GET：环境列表（脱敏）+ 激活环境 ID */
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

/** POST：{action: 'save'|'activate'|'delete', env?, id?, activate?} */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      action?: string
      env?: Partial<Environment> & { id?: string }
      id?: string
      activate?: boolean
    }
    switch (body.action) {
      case 'save': {
        const saved = saveEnvironment(body.env ?? {})
        if (body.activate !== false) {
          setActiveEnvironment(saved.id)
        }
        invalidateToken()
        break
      }
      case 'activate': {
        if (!body.id || !setActiveEnvironment(body.id)) {
          return NextResponse.json({ error: '环境不存在' }, { status: 404 })
        }
        invalidateToken()
        break
      }
      case 'delete': {
        if (body.id) deleteEnvironment(body.id)
        invalidateToken()
        break
      }
      default:
        return NextResponse.json({ error: '未知操作' }, { status: 400 })
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
