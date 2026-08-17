import { NextRequest, NextResponse } from 'next/server'
import { fail } from '@/lib/api'
import { getReportUsers } from '@/lib/pbi'
import { isSafeId } from '@/lib/validation'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    if (!isSafeId(id)) {
      return NextResponse.json({ error: 'report id 格式不正确' }, { status: 400 })
    }
    const users = await getReportUsers(id)
    return NextResponse.json({ users })
  } catch (e) {
    return fail(e)
  }
}
