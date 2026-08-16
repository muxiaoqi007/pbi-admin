import { NextRequest, NextResponse } from 'next/server'
import { fail } from '@/lib/api'
import { getReportUsers } from '@/lib/pbi'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const users = await getReportUsers(params.id)
    return NextResponse.json({ users })
  } catch (e) {
    return fail(e)
  }
}
