import { NextRequest, NextResponse } from 'next/server'
import { fail } from '@/lib/api'
import { getReportEmbedConfig } from '@/lib/pbi'
import { isSafeId } from '@/lib/validation'

export const dynamic = 'force-dynamic'

/** 获取报表嵌入配置（embedUrl + embedToken）：
 *  ?wid=工作区ID&rid=报表ID
 *  &rlsUsername=RLS用户名&rlsRole=RLS角色名（数据集配置了 RLS 时必填）
 */
export async function GET(req: NextRequest) {
  try {
    const wid = req.nextUrl.searchParams.get('wid')
    const rid = req.nextUrl.searchParams.get('rid')
    const rlsUsername = req.nextUrl.searchParams.get('rlsUsername')
    const rlsRole = req.nextUrl.searchParams.get('rlsRole')
    const datasetId = req.nextUrl.searchParams.get('datasetId')

    if (!isSafeId(wid) || !isSafeId(rid)) {
      return NextResponse.json({ error: '缺少 wid 或 rid 参数' }, { status: 400 })
    }

    // RLS 身份：用户名和角色都提供了才传（两者缺一不可）
    const rlsIdentity =
      rlsUsername && rlsRole && isSafeId(datasetId)
        ? { username: rlsUsername, roles: [rlsRole], datasetId }
        : undefined

    const config = await getReportEmbedConfig(wid, rid, rlsIdentity)
    return NextResponse.json(config)
  } catch (e) {
    return fail(e)
  }
}
