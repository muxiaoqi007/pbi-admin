import { NextRequest, NextResponse } from 'next/server'
import { fail } from '@/lib/api'
import { resolveRuntime } from '@/lib/config'
import { addServicePrincipalToWorkspace } from '@/lib/pbi'
import { isPlainObject, isSafeId } from '@/lib/validation'

export const dynamic = 'force-dynamic'

type Role = 'Admin' | 'Member' | 'Contributor'

/** 把当前配置的服务主体批量加入工作区：{workspaceIds: string[], role?: Role} */
export async function POST(req: NextRequest) {
  try {
    const raw = await req.json().catch(() => null)
    const body = isPlainObject(raw) ? raw : null
    const ids = body && Array.isArray(body.workspaceIds)
      ? Array.from(new Set(body.workspaceIds.filter(isSafeId))).slice(0, 50)
      : []
    if (ids.length === 0) {
      return NextResponse.json({ error: 'workspaceIds 不能为空' }, { status: 400 })
    }
    const role: Role =
      body?.role === 'Member' || body?.role === 'Contributor' ? body.role : 'Admin'

    const { clientId } = await resolveRuntime()
    if (!clientId) {
      return NextResponse.json({ error: '尚未配置客户端 ID' }, { status: 400 })
    }

    const results = await Promise.allSettled(
      ids.map((wid) => addServicePrincipalToWorkspace(wid, clientId, role)),
    )
    const succeeded = results
      .filter((result): result is PromiseFulfilledResult<
        Awaited<ReturnType<typeof addServicePrincipalToWorkspace>>
      > => result.status === 'fulfilled')
      .map((result) => result.value)
    const failures = results
      .map((r, i) => ({ wid: ids[i], r }))
      .filter(({ r }) => r.status === 'rejected')
      .map(({ wid, r }) => ({
        workspaceId: wid,
        error: r.status === 'rejected' ? String(r.reason?.message ?? r.reason) : '',
      }))
    return NextResponse.json({
      ok: failures.length === 0,
      added: succeeded.filter((result) => result.status === 'added').length,
      unchanged: succeeded.filter((result) => result.status === 'unchanged').length,
      failures,
    })
  } catch (e) {
    return fail(e)
  }
}
