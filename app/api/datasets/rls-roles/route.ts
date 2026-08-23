import { NextRequest, NextResponse } from 'next/server'
import { fail } from '@/lib/api'
import { PbiError, executeDaxQuery } from '@/lib/pbi'
import { isSafeId } from '@/lib/validation'

export const dynamic = 'force-dynamic'

/** 获取数据集的 RLS 角色列表：?wid=工作区ID&did=数据集ID
 *  优先尝试 DAX 目录查询（无需 Premium），回退 XMLA TMSCHEMA_ROLES */
export async function GET(req: NextRequest) {
  try {
    const wid = req.nextUrl.searchParams.get('wid')
    const did = req.nextUrl.searchParams.get('did')
    if (!isSafeId(wid) || !isSafeId(did)) {
      return NextResponse.json({ error: '缺少 wid 或 did 参数' }, { status: 400 })
    }

    // 尝试多种 DAX 查询获取角色
    const daxQueries = [
      'EVALUATE SELECTCOLUMNS(INFO.VIEW.ROLES(), "Name", [Name])',
      'EVALUATE INFO.VIEW.ROLES()',
      'EVALUATE SELECTCOLUMNS(INFO.ROLES(), "Name", [Name])',
      'EVALUATE INFO.ROLES()',
    ]

    for (const dax of daxQueries) {
      try {
        const rows = await executeDaxQuery(wid, did, dax)
        if (rows.length > 0) {
          const roles = rows
            .map((r) => String(r['[Name]'] ?? r['Name'] ?? ''))
            .filter(Boolean)
          if (roles.length > 0) {
            return NextResponse.json({ roles, source: 'dax' })
          }
        }
      } catch {
        // 该 DAX 查询不支持，继续尝试下一个
      }
    }

    // DAX 都不行，报错
    throw new PbiError(
      404,
      '无法通过 DAX 查询获取 RLS 角色（该引擎版本可能不支持 INFO.ROLES 系列 DAX 函数）。请手动输入角色名。',
    )
  } catch (e) {
    return fail(e)
  }
}
