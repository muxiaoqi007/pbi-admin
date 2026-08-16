import { NextRequest, NextResponse } from 'next/server'
import { fail } from '@/lib/api'
import { triggerRefresh } from '@/lib/pbi'

export const dynamic = 'force-dynamic'

const CONCURRENCY = 3
const MAX_ITEMS = 50

interface BatchItem {
  workspaceId: string
  datasetId: string
  name: string
}

/** 批量触发全部刷新：{items: [{workspaceId, datasetId, name?}]}，并发 3、单次上限 50 个 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { items?: BatchItem[] }
    const items = (body.items ?? [])
      .filter((i) => i.workspaceId && i.datasetId)
      .map((i) => ({ ...i, name: i.name ?? i.datasetId }))
      .slice(0, MAX_ITEMS)
    if (items.length === 0) {
      return NextResponse.json({ error: 'items 为空或格式不正确' }, { status: 400 })
    }

    // 共享游标 + 并发 3 的工作线程
    let cursor = 0
    const worker = async (): Promise<{ ok: boolean; name: string; error?: string }[]> => {
      const local: { ok: boolean; name: string; error?: string }[] = []
      for (;;) {
        const i = cursor++
        if (i >= items.length) break
        const item = items[i]
        try {
          await triggerRefresh({ workspaceId: item.workspaceId, datasetId: item.datasetId, mode: 'all' })
          local.push({ ok: true, name: item.name })
        } catch (e) {
          local.push({ ok: false, name: item.name, error: e instanceof Error ? e.message : String(e) })
        }
      }
      return local
    }

    const results = (
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker))
    ).flat()

    const failures = results.filter((r) => !r.ok)
    return NextResponse.json({
      total: results.length,
      success: results.length - failures.length,
      failures,
    })
  } catch (e) {
    return fail(e)
  }
}
