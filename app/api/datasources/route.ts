import { NextRequest, NextResponse } from 'next/server'
import { fail } from '@/lib/api'
import { getDatasourceIndex } from '@/lib/pbi'

export const dynamic = 'force-dynamic'

/** 数据源视角：按数据源聚合关联数据集。?force=1 强制重扫（缓存 10 分钟） */
export async function GET(req: NextRequest) {
  try {
    const force = req.nextUrl.searchParams.get('force') === '1'
    const index = await getDatasourceIndex(force)
    return NextResponse.json(index)
  } catch (e) {
    return fail(e)
  }
}
