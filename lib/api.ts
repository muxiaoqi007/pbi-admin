import { NextResponse } from 'next/server'
import { PbiError } from './pbi'

/** 统一把业务错误转成 JSON 响应 */
export function fail(e: unknown): NextResponse {
  if (e instanceof PbiError) {
    return NextResponse.json({ error: e.message, status: e.status, code: e.code }, { status: e.status })
  }
  const message = e instanceof Error ? e.message : String(e)
  return NextResponse.json({ error: message }, { status: 500 })
}
