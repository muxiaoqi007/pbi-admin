import { NextRequest, NextResponse } from 'next/server'
import { fail } from '@/lib/api'
import { getActiveEnvironment } from '@/lib/config'
import {
  createPortalGroup,
  deletePortalGroup,
  listPortalGroups,
  renamePortalGroup,
  setPortalGroupItems,
} from '@/lib/catalog-store'
import { isSafeId } from '@/lib/validation'

export const dynamic = 'force-dynamic'

interface GroupPayload {
  action: 'create' | 'rename' | 'delete' | 'setItems'
  groupId?: string
  name?: string
  items?: { reportId: string; workspaceId: string }[]
}

/** 门户分组管理：GET 列表 / POST 增删改 */
export async function GET() {
  try {
    const envId = getActiveEnvironment()?.id ?? ''
    return NextResponse.json({ groups: listPortalGroups(envId) })
  } catch (e) {
    return fail(e)
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as GroupPayload
    const envId = getActiveEnvironment()?.id ?? ''
    switch (body.action) {
      case 'create': {
        if (!body.name?.trim()) return NextResponse.json({ error: '分组名称不能为空' }, { status: 400 })
        const group = createPortalGroup(envId, body.name.trim())
        return NextResponse.json({ ok: true, group, groups: listPortalGroups(envId) })
      }
      case 'rename': {
        if (!body.groupId || !body.name?.trim()) return NextResponse.json({ error: '参数不完整' }, { status: 400 })
        if (!/^[A-Za-z0-9_-]{1,64}$/.test(body.groupId)) return NextResponse.json({ error: 'groupId 格式不正确' }, { status: 400 })
        renamePortalGroup(envId, body.groupId, body.name.trim())
        return NextResponse.json({ ok: true, groups: listPortalGroups(envId) })
      }
      case 'delete': {
        if (!body.groupId) return NextResponse.json({ error: '参数不完整' }, { status: 400 })
        if (!/^[A-Za-z0-9_-]{1,64}$/.test(body.groupId)) return NextResponse.json({ error: 'groupId 格式不正确' }, { status: 400 })
        deletePortalGroup(envId, body.groupId)
        return NextResponse.json({ ok: true, groups: listPortalGroups(envId) })
      }
      case 'setItems': {
        if (!body.groupId || !Array.isArray(body.items)) return NextResponse.json({ error: '参数不完整' }, { status: 400 })
        if (!/^[A-Za-z0-9_-]{1,64}$/.test(body.groupId)) return NextResponse.json({ error: 'groupId 格式不正确' }, { status: 400 })
        const items = body.items
          .filter((i) => isSafeId(i.reportId) && isSafeId(i.workspaceId))
          .map((i) => ({ reportId: i.reportId, workspaceId: i.workspaceId }))
        setPortalGroupItems(envId, body.groupId, items)
        return NextResponse.json({ ok: true, groups: listPortalGroups(envId) })
      }
      default:
        return NextResponse.json({ error: '未知操作' }, { status: 400 })
    }
  } catch (e) {
    return fail(e)
  }
}
