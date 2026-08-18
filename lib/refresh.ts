import { getAccessToken } from './auth'
import { resolveRuntime } from './config'
import { PbiError } from './pbi'
import type { RefreshType } from './types'
import { isTrustedPbiRequestUrl } from './validation'

export interface RefreshRequest {
  workspaceId: string
  datasetId: string
  mode: 'all' | 'allEnhanced' | 'tables'
  tables?: string[]
  type?: RefreshType
  retryCount?: number
  maxParallelism?: number
  commitMode?: 'transactional' | 'partialBatch'
  applyRefreshPolicy?: boolean
  effectiveDate?: string
}

export interface Accepted {
  accepted: boolean
  status: number
  location?: string
}

/** Build the Power BI refresh body. notifyOption is valid for the classic refresh
 * endpoint contract, but must not be sent with enhanced refresh parameters. */
export function buildRefreshBody(req: RefreshRequest): Record<string, unknown> {
  if (req.mode === 'all') {
    return { notifyOption: 'NoNotification' }
  }

  const body: Record<string, unknown> = {
    type: req.type ?? 'full',
    commitMode: req.commitMode ?? 'transactional',
    maxParallelism: req.maxParallelism ?? 1,
    retryCount: req.retryCount ?? 0,
  }

  if (req.mode === 'tables') {
    body.objects = (req.tables ?? []).map((table) => ({ table }))
  }
  if (req.applyRefreshPolicy !== undefined) {
    body.applyRefreshPolicy = req.applyRefreshPolicy
  }
  if (req.effectiveDate) {
    body.effectiveDate = req.effectiveDate
  }
  return body
}

async function requestRefresh(req: RefreshRequest, forceToken = false): Promise<Response> {
  const runtime = await resolveRuntime()
  const token = await getAccessToken(forceToken)
  const path = `/groups/${req.workspaceId}/datasets/${req.datasetId}/refreshes`
  let url = `${runtime.apiBase}${path}`
  if (!isTrustedPbiRequestUrl(url)) {
    throw new PbiError(400, '拒绝向非 Power BI/Microsoft 域名发送访问令牌', 'UNTRUSTED_PBI_URL')
  }
  let response: Response

  for (let hop = 0; ; hop++) {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(buildRefreshBody(req)),
      cache: 'no-store',
      redirect: 'manual',
    })
    const location = response.headers.get('location')
    if ([301, 302, 303, 307, 308].includes(response.status) && location && hop < 5) {
      const nextUrl = new URL(location, url).toString()
      if (!isTrustedPbiRequestUrl(nextUrl)) {
        throw new PbiError(
          502,
          'Power BI 返回了不受信任的重定向地址，已拒绝转发访问令牌',
          'UNTRUSTED_PBI_REDIRECT',
        )
      }
      url = nextUrl
      continue
    }
    break
  }

  if ((response.status === 401 || response.status === 403) && !forceToken) {
    return requestRefresh(req, true)
  }
  return response
}

async function responseError(response: Response): Promise<PbiError> {
  const text = await response.text().catch(() => '')
  let message = text || response.statusText
  let code: string | undefined
  try {
    const json = JSON.parse(text)
    message = json.error?.message || json.error?.code || json.message || text
    code = json.error?.code || json.errorCode || undefined
  } catch {
    // Keep the original response text.
  }
  return new PbiError(response.status, message, code)
}

export async function triggerRefresh(req: RefreshRequest): Promise<Accepted> {
  const response = await requestRefresh(req)
  if (!response.ok && response.status !== 202) {
    throw await responseError(response)
  }
  return {
    accepted: true,
    status: response.status,
    location: response.headers.get('location') ?? undefined,
  }
}
