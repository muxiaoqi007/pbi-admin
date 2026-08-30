import { NextRequest, NextResponse } from 'next/server'
import { fail } from '@/lib/api'
import { getActiveEnvironment } from '@/lib/config'
import { loadEmbedUsage, saveEmbedEvents } from '@/lib/catalog-store'

export const dynamic = 'force-dynamic'

interface EventPayload {
  sessionId?: string
  reportId?: string
  workspaceId?: string
  eventType?: string
  pageName?: string
  details?: Record<string, unknown>
  rlsUsername?: string
  rlsRole?: string
  ts?: string
}

/** 嵌入埋点：POST 批量上报预览会话事件；GET 查询使用统计 ?days=7 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { events?: EventPayload[] }
    const events = (body.events ?? []).filter(
      (e): e is Required<Omit<EventPayload, 'pageName' | 'details' | 'ts'>> & Partial<EventPayload> =>
        typeof e.sessionId === 'string' &&
        typeof e.reportId === 'string' &&
        typeof e.workspaceId === 'string' &&
        typeof e.eventType === 'string',
    )
    if (events.length === 0) {
      return NextResponse.json({ saved: 0 })
    }
    const envId = getActiveEnvironment()?.id ?? ''
    const saved = saveEmbedEvents(
      events.slice(0, 100).map((e) => ({
        environmentId: envId,
        sessionId: e.sessionId,
        reportId: e.reportId,
        workspaceId: e.workspaceId,
        eventType: e.eventType,
        pageName: e.pageName,
        reportName: (e as { reportName?: string }).reportName,
        details: e.details,
        rlsUsername: e.rlsUsername,
        rlsRole: e.rlsRole,
      })),
    )
    return NextResponse.json({ saved })
  } catch (e) {
    return fail(e)
  }
}

export async function GET(req: NextRequest) {
  try {
    const days = Math.min(90, Math.max(1, Number(req.nextUrl.searchParams.get('days') ?? 7)))
    const envId = getActiveEnvironment()?.id ?? ''
    return NextResponse.json(loadEmbedUsage(envId, days))
  } catch (e) {
    return fail(e)
  }
}
