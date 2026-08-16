import { NextRequest, NextResponse } from 'next/server'
import { fail } from '@/lib/api'
import { getDatasetDatasources } from '@/lib/pbi'

export const dynamic = 'force-dynamic'

/** ?wid=工作区ID：成员模式下用普通路由查数据源 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const wid = req.nextUrl.searchParams.get('wid') ?? undefined
    const datasources = await getDatasetDatasources(params.id, wid)
    return NextResponse.json({ datasources })
  } catch (e) {
    return fail(e)
  }
}
