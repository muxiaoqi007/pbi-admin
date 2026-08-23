import { NextRequest, NextResponse } from 'next/server'
import { fail } from '@/lib/api'
import { getReportEmbedConfig } from '@/lib/pbi'
import { isSafeId } from '@/lib/validation'

export const dynamic = 'force-dynamic'

/** 获取报表嵌入配置（embedUrl + embedToken）：?wid=工作区ID&rid=报表ID */
export async function GET(req: NextRequest) {
  try {
    const wid = req.nextUrl.searchParams.get('wid')
    const rid = req.nextUrl.searchParams.get('rid')
    if (!isSafeId(wid) || !isSafeId(rid)) {
      return NextResponse.json({ error: '缺少 wid 或 rid 参数' }, { status: 400 })
    }
    const config = await getReportEmbedConfig(wid, rid)
    return NextResponse.json(config)
  } catch (e) {
    return fail(e)
  }
}
