import { NextRequest, NextResponse } from 'next/server'
import { fail } from '@/lib/api'
import { getActiveEnvironment } from '@/lib/config'
import { exportDatasetDocMarkdown } from '@/lib/catalog-store'
import { getDatasetSchema } from '@/lib/pbi'
import { isSafeId } from '@/lib/validation'

export const dynamic = 'force-dynamic'

/** 导出数据集文档（Markdown）：?wid=&did= */
export async function GET(req: NextRequest) {
  try {
    const wid = req.nextUrl.searchParams.get('wid')
    const did = req.nextUrl.searchParams.get('did')
    if (!isSafeId(wid) || !isSafeId(did)) {
      return NextResponse.json({ error: '参数格式不正确' }, { status: 400 })
    }
    const envId = getActiveEnvironment()?.id ?? ''
    const schema = await getDatasetSchema(wid, did)
    const nameRow = schema.tables[0]?.name ? '' : ''
    // 数据集名从快照拿（schema 里没有）
    const snapRes = await fetch(new URL('/api/snapshot', req.url).toString())
    const snap = await snapRes.json()
    const dataset = (snap.datasets ?? []).find((d: { id: string }) => d.id === did)
    const datasetName = dataset?.name ?? did
    void nameRow
    const md = exportDatasetDocMarkdown(envId, wid, did, datasetName, schema)
    return new NextResponse(md, {
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Content-Disposition': `attachment; filename="dataset-doc-${did.slice(0, 8)}.md"`,
      },
    })
  } catch (e) {
    return fail(e)
  }
}
