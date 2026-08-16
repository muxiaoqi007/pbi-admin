import { NextRequest, NextResponse } from 'next/server'
import { fail } from '@/lib/api'
import { getRefreshFailures } from '@/lib/pbi'

export const dynamic = 'force-dynamic'

/** 刷新失败巡检：扫描可刷新数据集的最近记录，汇总最近一次失败的数据集。?force=1 强制重扫（缓存 10 分钟） */
export async function GET(req: NextRequest) {
  try {
    const force = req.nextUrl.searchParams.get('force') === '1'
    const failures = await getRefreshFailures(force)
    return NextResponse.json({ failures })
  } catch (e) {
    return fail(e)
  }
}
