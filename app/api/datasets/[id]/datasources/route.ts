import { NextRequest, NextResponse } from 'next/server'
import { fail } from '@/lib/api'
import { getDatasetDatasources } from '@/lib/pbi'
import { isSafeId } from '@/lib/validation'

export const dynamic = 'force-dynamic'

/** ?wid=工作区ID：成员模式下用普通路由查数据源 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const wid = req.nextUrl.searchParams.get('wid') ?? undefined
    if (!isSafeId(id) || (wid !== undefined && !isSafeId(wid))) {
      return NextResponse.json({ error: '参数格式不正确' }, { status: 400 })
    }
    const datasources = await getDatasetDatasources(id, wid)
    return NextResponse.json({ datasources })
  } catch (e) {
    return fail(e)
  }
}
