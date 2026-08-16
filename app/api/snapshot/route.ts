import { NextRequest, NextResponse } from 'next/server'
import { fail } from '@/lib/api'
import { getTenantSnapshot } from '@/lib/pbi'

export const dynamic = 'force-dynamic'

/** 全租户快照：工作区（含成员）+ 报表 + 数据集。?force=1 强制刷新 */
export async function GET(req: NextRequest) {
  try {
    const force = req.nextUrl.searchParams.get('force') === '1'
    const snapshot = await getTenantSnapshot(force)
    return NextResponse.json(snapshot)
  } catch (e) {
    return fail(e)
  }
}
