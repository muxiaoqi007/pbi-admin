import { NextRequest, NextResponse } from 'next/server'
import { fail } from '@/lib/api'
import { getActiveEnvironment } from '@/lib/config'
import { loadColumnNotes, loadDatasetNote, saveColumnNote, saveDatasetNote } from '@/lib/catalog-store'
import { isSafeId } from '@/lib/validation'

export const dynamic = 'force-dynamic'

/** 读取备注：?wid=&did= → { note, columnNotes } */
export async function GET(req: NextRequest) {
  try {
    const wid = req.nextUrl.searchParams.get('wid')
    const did = req.nextUrl.searchParams.get('did')
    if (!isSafeId(wid) || !isSafeId(did)) {
      return NextResponse.json({ error: '参数格式不正确' }, { status: 400 })
    }
    const envId = getActiveEnvironment()?.id ?? ''
    return NextResponse.json({
      note: loadDatasetNote(envId, wid, did),
      columnNotes: loadColumnNotes(envId, wid, did),
    })
  } catch (e) {
    return fail(e)
  }
}

/** 保存备注：{wid, did, note?, columnNotes?: {表.字段: 说明}} */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      wid?: string
      did?: string
      note?: string
      columnNotes?: Record<string, string>
    }
    if (!isSafeId(body.wid) || !isSafeId(body.did)) {
      return NextResponse.json({ error: '参数格式不正确' }, { status: 400 })
    }
    const envId = getActiveEnvironment()?.id ?? ''
    if (typeof body.note === 'string') {
      saveDatasetNote({ environmentId: envId, workspaceId: body.wid, datasetId: body.did, note: body.note })
    }
    if (body.columnNotes && typeof body.columnNotes === 'object') {
      for (const [key, note] of Object.entries(body.columnNotes)) {
        const dot = key.indexOf('.')
        if (dot <= 0) continue
        const tableName = key.slice(0, dot)
        const columnName = key.slice(dot + 1)
        if (!tableName || !columnName || typeof note !== 'string') continue
        saveColumnNote({ environmentId: envId, workspaceId: body.wid, datasetId: body.did, tableName, columnName, note })
      }
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    return fail(e)
  }
}
