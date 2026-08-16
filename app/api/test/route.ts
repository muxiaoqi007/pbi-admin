import { NextResponse } from 'next/server'
import { getAccessToken } from '@/lib/auth'
import { fail } from '@/lib/api'
import { getTenantSnapshot } from '@/lib/pbi'

export const dynamic = 'force-dynamic'

/** 测试连接：取 token + 拉一个工作区分页，验证端到端链路 */
export async function POST() {
  try {
    const token = await getAccessToken(true)
    const snapshot = await getTenantSnapshot(true)
    return NextResponse.json({
      ok: true,
      tokenPreview: `${token.slice(0, 12)}...`,
      mode: snapshot.mode,
      workspaceCount: snapshot.workspaces.length,
      reportCount: snapshot.reports.length,
      datasetCount: snapshot.datasets.length,
      fetchedAt: snapshot.fetchedAt,
    })
  } catch (e) {
    return fail(e)
  }
}
