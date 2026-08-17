import { NextRequest, NextResponse } from 'next/server'
import { fail } from '@/lib/api'
import { getDatasetSchema } from '@/lib/pbi'
import { isSafeId } from '@/lib/validation'

export const dynamic = 'force-dynamic'

/** 数据集完整 Schema（表/列/度量值）：?wid=工作区ID&did=数据集ID
 *  首次调用会触发工作区级 getInfo 扫描（约 5-15 秒），之后缓存 30 分钟 */
export async function GET(req: NextRequest) {
  try {
    const wid = req.nextUrl.searchParams.get('wid')
    const did = req.nextUrl.searchParams.get('did')
    if (!isSafeId(wid) || !isSafeId(did)) {
      return NextResponse.json({ error: '缺少 wid 或 did 参数' }, { status: 400 })
    }
    const schema = await getDatasetSchema(wid, did)
    return NextResponse.json({ schema })
  } catch (e) {
    return fail(e)
  }
}
