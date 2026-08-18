import { NextResponse } from 'next/server'
import { getAccessToken } from '@/lib/auth'
import { fail } from '@/lib/api'
import { getConnectionDiagnostics, getTenantSnapshot } from '@/lib/pbi'

export const dynamic = 'force-dynamic'

/** 测试连接：取 token + 拉取快照 + 分别探测普通 API / Admin API。 */
export async function POST() {
  try {
    const token = await getAccessToken(true)
    const diagnostics = await getConnectionDiagnostics(false)
    const snapshot = await getTenantSnapshot(true)
    const adminEndpoint = diagnostics.endpoints.find((endpoint) =>
      endpoint.path.startsWith('/admin/'),
    )
    const derivedFallbackReason =
      snapshot.mode === 'member' && adminEndpoint && !adminEndpoint.ok
        ? `Admin API ${adminEndpoint.status ? `HTTP ${adminEndpoint.status}` : '请求失败'}${
            'detail' in adminEndpoint && adminEndpoint.detail ? `：${adminEndpoint.detail}` : ''
          }`
        : undefined

    return NextResponse.json({
      ok: true,
      tokenAcquired: Boolean(token),
      mode: snapshot.mode,
      adminFallbackReason: snapshot.adminFallbackReason ?? derivedFallbackReason,
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
