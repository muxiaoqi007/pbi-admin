import { NextRequest, NextResponse } from 'next/server'
import { fail } from '@/lib/api'
import { getReportPages } from '@/lib/pbi'

export const dynamic = 'force-dynamic'

/** 报表页面清单：?wid=工作区ID&rid=报表ID */
export async function GET(req: NextRequest) {
  try {
    const wid = req.nextUrl.searchParams.get('wid')
    const rid = req.nextUrl.searchParams.get('rid')
    if (!wid || !rid) {
      return NextResponse.json({ error: '缺少 wid 或 rid 参数' }, { status: 400 })
    }
    const pages = await getReportPages(wid, rid)
    return NextResponse.json({ pages })
  } catch (e) {
    return fail(e)
  }
}
