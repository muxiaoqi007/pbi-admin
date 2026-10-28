import { NextRequest, NextResponse } from 'next/server'
import { fail } from '@/lib/api'
import { getRefreshFailures } from '@/lib/pbi'

export const dynamic = 'force-dynamic'

/**
 * 刷新失败巡检：扫描可刷新数据集的最近记录，返回失败项及扫描覆盖率。
 * ?force=1 强制重扫。完整结果缓存 10 分钟，部分结果只缓存 1 分钟。
 */
export async function GET(req: NextRequest) {
  try {
    const force = req.nextUrl.searchParams.get('force') === '1'
    return NextResponse.json(await getRefreshFailures(force))
  } catch (e) {
    return fail(e)
  }
}
