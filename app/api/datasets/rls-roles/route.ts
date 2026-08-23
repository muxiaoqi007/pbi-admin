import { NextRequest, NextResponse } from 'next/server'
import { fail } from '@/lib/api'
import { PbiError, getDatasetName } from '@/lib/pbi'
import { getDatasetRlsRoles } from '@/lib/xmla'
import { isSafeId } from '@/lib/validation'

export const dynamic = 'force-dynamic'

/** 获取数据集的 RLS 角色列表：?wid=工作区ID&did=数据集ID
 *  通过 XMLA TMSCHEMA_ROLES 查询，需要 Premium 容量的 XMLA 端点 */
export async function GET(req: NextRequest) {
  try {
    const wid = req.nextUrl.searchParams.get('wid')
    const did = req.nextUrl.searchParams.get('did')
    if (!isSafeId(wid) || !isSafeId(did)) {
      return NextResponse.json({ error: '缺少 wid 或 did 参数' }, { status: 400 })
    }
    // 获取数据集名称（XMLA catalog 需要用数据集名而不是 ID）
    let datasetName: string
    try {
      datasetName = await getDatasetName(wid, did)
    } catch {
      throw new PbiError(404, '未找到数据集，无法获取 RLS 角色')
    }

    const roles = await getDatasetRlsRoles(wid, datasetName)
    return NextResponse.json({ roles })
  } catch (e) {
    return fail(e)
  }
}
