import { NextRequest, NextResponse } from 'next/server'
import { fail } from '@/lib/api'
import { getRefreshHistory } from '@/lib/pbi'

export const dynamic = 'force-dynamic'

/** 刷新记录：?wid=工作区ID&did=数据集ID */
export async function GET(req: NextRequest) {
  try {
    const wid = req.nextUrl.searchParams.get('wid')
    const did = req.nextUrl.searchParams.get('did')
    if (!wid || !did) {
      return NextResponse.json({ error: '缺少 wid 或 did 参数' }, { status: 400 })
    }
    const refreshes = await getRefreshHistory(wid, did)
    return NextResponse.json({ refreshes })
  } catch (e) {
    return fail(e)
  }
}
