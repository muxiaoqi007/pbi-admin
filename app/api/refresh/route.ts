import { NextRequest, NextResponse } from 'next/server'
import { fail } from '@/lib/api'
import { triggerRefresh, type RefreshRequest } from '@/lib/pbi'
import { REFRESH_TYPES } from '@/lib/types'

export const dynamic = 'force-dynamic'

/** 触发刷新：{workspaceId, datasetId, mode: 'all'|'allEnhanced'|'tables', tables?, type?, retryCount?, maxParallelism?, commitMode?, applyRefreshPolicy?, effectiveDate?} */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Partial<RefreshRequest>
    if (!body.workspaceId || !body.datasetId) {
      return NextResponse.json({ error: '缺少 workspaceId 或 datasetId' }, { status: 400 })
    }
    const mode: RefreshRequest['mode'] =
      body.mode === 'allEnhanced' || body.mode === 'tables' ? body.mode : 'all'
    if (mode === 'tables' && (!body.tables || body.tables.length === 0)) {
      return NextResponse.json({ error: '选表刷新至少需要选择或输入一张表' }, { status: 400 })
    }
    const type =
      body.type && (REFRESH_TYPES as readonly string[]).includes(body.type) ? body.type : 'full'

    const result = await triggerRefresh({
      workspaceId: body.workspaceId,
      datasetId: body.datasetId,
      mode,
      tables: body.tables?.filter((t) => typeof t === 'string' && t.trim()).map((t) => t.trim()),
      type,
      retryCount: clampInt(body.retryCount, 0, 10),
      maxParallelism: clampInt(body.maxParallelism, 1, 30),
      commitMode: body.commitMode === 'partialBatch' ? 'partialBatch' : 'transactional',
      applyRefreshPolicy:
        body.applyRefreshPolicy === undefined ? undefined : Boolean(body.applyRefreshPolicy),
      effectiveDate: typeof body.effectiveDate === 'string' ? body.effectiveDate : undefined,
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
