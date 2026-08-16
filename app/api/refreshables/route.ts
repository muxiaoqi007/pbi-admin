import { NextResponse } from 'next/server'
import { fail } from '@/lib/api'
import { getRefreshables } from '@/lib/pbi'

export const dynamic = 'force-dynamic'

/** 租户内可刷新项及最近刷新状态（部分租户无权限时前端会隐藏该卡片） */
export async function GET() {
  try {
    const refreshables = await getRefreshables()
    return NextResponse.json({ refreshables })
  } catch (e) {
    return fail(e)
  }
}
