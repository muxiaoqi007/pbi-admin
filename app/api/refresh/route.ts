import { NextRequest, NextResponse } from 'next/server'
import { fail } from '@/lib/api'
import { triggerRefresh, type RefreshRequest } from '@/lib/pbi'

export const dynamic = 'force-dynamic'

/** 触发刷新：{workspaceId, datasetId, mode: 'all'|'tables', tables?, type?, retryCount?, maxParallelism?, commitMode?} */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Partial<RefreshRequest>
    if (!body.workspaceId || !body.datasetId) {
      return NextResponse.json({ error: '缺少 workspaceId 或 datasetId' }, { status: 400 })
    }
    if (body.mode === 'tables' && (!body.tables || body.tables.length === 0)) {
      return NextResponse.json({ error: '选表刷新至少需要勾选一张表' }, { status: 400 })
    }
    const result = await triggerRefresh({
      workspaceId: body.workspaceId,
      datasetId: body.datasetId,
      mode: body.mode === 'tables' ? 'tables' : 'all',
      tables: body.tables,
      type: body.type === 'automatic' ? 'automatic' : 'full',
      retryCount: clampInt(body.retryCount, 0, 10),
      maxParallelism: clampInt(body.maxParallelism, 1, 30),
      commitMode: body.commitMode === 'partialBatch' ? 'partialBatch' : 'transactional',
    })
    return NextResponse.json(result)
  } catch (e) {
    return fail(e)
  }
}

function clampInt(v: unknown, min: number, max: number): number | undefined {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) return undefined
  return Math.min(max, Math.max(min, Math.round(n)))
}
