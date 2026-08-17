import { NextResponse } from 'next/server'
import { getAccessToken } from '@/lib/auth'
import { fail } from '@/lib/api'
import { getConnectionDiagnostics, getTenantSnapshot } from '@/lib/pbi'

export const dynamic = 'force-dynamic'

/** 测试连接：取 token + 拉一个工作区分页，验证端到端链路 */
export async function POST() {
  try {
    const token = await getAccessToken(true)
    const diagnostics = await getConnectionDiagnostics(false)
    const snapshot = await getTenantSnapshot(true)
    return NextResponse.json({
      ok: true,
      tokenAcquired: Boolean(token),
      mode: snapshot.mode,
      adminFallbackReason: snapshot.adminFallbackReason,
      workspaceCount: snapshot.workspaces.length,
      reportCount: snapshot.reports.length,
      datasetCount: snapshot.datasets.length,
      fetchedAt: snapshot.fetchedAt,
      diagnostics,
    })
  } catch (e) {
    return fail(e)
  }
}
