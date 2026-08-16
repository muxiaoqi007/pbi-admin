import { NextRequest, NextResponse } from 'next/server'
import { fail } from '@/lib/api'
import { getRefreshSchedule } from '@/lib/pbi'

export const dynamic = 'force-dynamic'

/** 数据集定时刷新计划：?wid=工作区ID&did=数据集ID */
export async function GET(req: NextRequest) {
  try {
    const wid = req.nextUrl.searchParams.get('wid')
    const did = req.nextUrl.searchParams.get('did')
    if (!wid || !did) {
      return NextResponse.json({ error: '缺少 wid 或 did 参数' }, { status: 400 })
    }
    const schedule = await getRefreshSchedule(wid, did)
    return NextResponse.json({ schedule })
  } catch (e) {
    return fail(e)
  }
}
