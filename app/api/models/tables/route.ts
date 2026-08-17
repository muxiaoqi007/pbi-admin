import { NextRequest, NextResponse } from 'next/server'
import { fail } from '@/lib/api'
import { getDatasetTablesDetailed } from '@/lib/pbi'
import { isSafeId } from '@/lib/validation'

export const dynamic = 'force-dynamic'

/** 成员模式下的轻量表目录：优先普通工作区接口 / executeQueries，再回退到 Schema 扫描。 */
export async function GET(req: NextRequest) {
  try {
    const wid = req.nextUrl.searchParams.get('wid')
    const did = req.nextUrl.searchParams.get('did')
    if (!isSafeId(wid) || !isSafeId(did)) return NextResponse.json({ error: '缺少 wid 或 did 参数' }, { status: 400 })
    return NextResponse.json(await getDatasetTablesDetailed(wid, did))
  } catch (e) {
    return fail(e)
  }
}
