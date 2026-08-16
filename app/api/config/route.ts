import { NextRequest, NextResponse } from 'next/server'
import { invalidateToken } from '@/lib/auth'
import { isCloudEnv } from '@/lib/cloud'
import { loadConfig, maskConfig, saveConfig } from '@/lib/config'
import { fail } from '@/lib/api'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const cfg = await loadConfig()
    return NextResponse.json({ config: maskConfig(cfg) })
  } catch (e) {
    return fail(e)
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Record<string, unknown>
    await saveConfig({
      cloud: isCloudEnv(body.cloud) ? body.cloud : undefined,
      tenantId: typeof body.tenantId === 'string' ? body.tenantId : undefined,
      clientId: typeof body.clientId === 'string' ? body.clientId : undefined,
      clientSecret: typeof body.clientSecret === 'string' ? body.clientSecret : undefined,
      authorityOverride: typeof body.authorityOverride === 'string' ? body.authorityOverride : undefined,
      apiBaseOverride: typeof body.apiBaseOverride === 'string' ? body.apiBaseOverride : undefined,
      resourceOverride: typeof body.resourceOverride === 'string' ? body.resourceOverride : undefined,
    })
    invalidateToken()
    const cfg = await loadConfig()
    return NextResponse.json({ ok: true, config: maskConfig(cfg) })
  } catch (e) {
    return fail(e)
  }
}
