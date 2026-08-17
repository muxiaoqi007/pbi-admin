import { NextRequest, NextResponse } from 'next/server'
import { fail } from '@/lib/api'
import { getDatasetTablesDetailed } from '@/lib/pbi'
import { saveDatasetTables } from '@/lib/catalog-store'
import { getActiveEnvironment } from '@/lib/config'
import { isSafeId } from '@/lib/validation'

export const dynamic = 'force-dynamic'

/** 数据集表清单（用于选表刷新）：?wid=工作区ID&did=数据集ID */
export async function GET(req: NextRequest) {
  try {
    const wid = req.nextUrl.searchParams.get('wid')
    const did = req.nextUrl.searchParams.get('did')
    if (!isSafeId(wid) || !isSafeId(did)) {
      return NextResponse.json({ error: '缺少 wid 或 did 参数' }, { status: 400 })
    }
    const force = req.nextUrl.searchParams.get('force') === '1'
    return NextResponse.json(await getDatasetTablesDetailed(wid, did, { force }))
  } catch (e) {
    return fail(e)
  }
}

/** 将旧版浏览器表缓存迁移到统一服务端目录。只接收已由 API 获取的表名。 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { workspaceId?: string; datasetId?: string; tables?: string[]; fetchedAt?: string }
    if (!isSafeId(body.workspaceId) || !isSafeId(body.datasetId) || !Array.isArray(body.tables)) {
      return NextResponse.json({ error: '参数格式不正确' }, { status: 400 })
    }
    const tables = Array.from(new Set(body.tables.map((name) => String(name).trim()).filter(Boolean))).map((name) => ({ name }))
    if (tables.length) saveDatasetTables({
      environmentId: getActiveEnvironment()?.id ?? '',
      workspaceId: body.workspaceId,
      datasetId: body.datasetId,
      source: 'legacy',
      tables,
      fetchedAt: body.fetchedAt ?? new Date().toISOString(),
    })
    return NextResponse.json({ saved: tables.length })
  } catch (e) {
    return fail(e)
  }
}
