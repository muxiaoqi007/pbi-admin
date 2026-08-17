import { NextRequest, NextResponse } from 'next/server'
import { fail } from '@/lib/api'
import { getDatasetUsers } from '@/lib/pbi'
import { isSafeId } from '@/lib/validation'

export const dynamic = 'force-dynamic'

/** 数据集权限用户：?wid=工作区ID&did=数据集ID */
export async function GET(req: NextRequest) {
  try {
    const wid = req.nextUrl.searchParams.get('wid')
    const did = req.nextUrl.searchParams.get('did')
    if (!isSafeId(wid) || !isSafeId(did)) {
      return NextResponse.json({ error: '缺少 wid 或 did 参数' }, { status: 400 })
    }
    const users = await getDatasetUsers(wid, did)
    return NextResponse.json({ users })
  } catch (e) {
    return fail(e)
  }
}
