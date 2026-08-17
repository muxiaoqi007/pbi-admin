import { NextRequest, NextResponse } from 'next/server'
import { fail } from '@/lib/api'
import { getDatasetSchemaViaXmlaDiagnostics } from '@/lib/xmla'
import { getDatasetName } from '@/lib/pbi'
import { isSafeId } from '@/lib/validation'
import { XmlaError } from '@/lib/xmla'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const wid = req.nextUrl.searchParams.get('wid')
    const did = req.nextUrl.searchParams.get('did')
    if (!isSafeId(wid) || !isSafeId(did)) return NextResponse.json({ error: '缺少 wid 或 did 参数' }, { status: 400 })
    const datasetName = await getDatasetName(wid, did)
    const result = await getDatasetSchemaViaXmlaDiagnostics(wid, datasetName)
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof XmlaError) {
      return NextResponse.json({ error: error.message, status: error.status, code: error.code, details: error.details }, { status: error.status })
    }
    return fail(error)
  }
}
