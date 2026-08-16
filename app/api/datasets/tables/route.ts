import { NextRequest, NextResponse } from 'next/server'
import { fail } from '@/lib/api'
import { getDatasetTables } from '@/lib/pbi'

export const dynamic = 'force-dynamic'

/** 数据集表清单（用于选表刷新）：?wid=工作区ID&did=数据集ID */
export async function GET(req: NextRequest) {
  try {
    const wid = req.nextUrl.searchParams.get('wid')
    const did = req.nextUrl.searchParams.get('did')
    if (!wid || !did) {
      return NextResponse.json({ error: '缺少 wid 或 did 参数' }, { status: 400 })
    }
    const tables = await getDatasetTables(wid, did)
    return NextResponse.json({ tables })
  } catch (e) {
    return fail(e)
  }
}
