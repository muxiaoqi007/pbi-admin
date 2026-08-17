import { NextRequest, NextResponse } from 'next/server'
import { fail } from '@/lib/api'
import { PbiError, getReportPages } from '@/lib/pbi'
import { isSafeId } from '@/lib/validation'

export const dynamic = 'force-dynamic'

/** 报表页面清单：?wid=工作区ID&rid=报表ID
 *  此接口走普通 API（/groups/{wid}/reports/{rid}/pages），需要服务主体
 *  在报表所在工作区有成员权限。管理模式下 admin API 可用时仍可能 401。 */
export async function GET(req: NextRequest) {
  try {
    const wid = req.nextUrl.searchParams.get('wid')
    const rid = req.nextUrl.searchParams.get('rid')
    if (!isSafeId(wid) || !isSafeId(rid)) {
      return NextResponse.json({ error: '缺少 wid 或 rid 参数' }, { status: 400 })
    }
    const pages = await getReportPages(wid, rid)
    return NextResponse.json({ pages })
  } catch (e) {
    if (e instanceof PbiError && (e.status === 401 || e.status === 403)) {
      return NextResponse.json(
        {
          error:
            '无法读取报表页面：服务主体对该报表所在工作区没有成员权限。报表页面接口（/groups/{wid}/reports/{rid}/pages）需要工作区级别的 Read 权限，管理 API 权限不够。请将服务主体加入该工作区，或使用账号密码认证（ROPC）。',
        },
        { status: e.status },
      )
    }
    return fail(e)
  }
}
