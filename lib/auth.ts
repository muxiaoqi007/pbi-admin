import { configReady, resolveRuntime } from './config'

interface TokenCache {
  key: string
  token: string
  expiresAt: number // 毫秒时间戳
}

let cache: TokenCache | null = null

/**
 * client_credentials 获取访问令牌（v1 认证流：/oauth2/token + resource 参数，
 * 与世纪互联/国际版 Power BI 均验证可用的方式一致），按配置签名缓存。
 * force=true 时强制刷新（配置变更或收到 401 时使用）。
 */
export async function getAccessToken(force = false): Promise<string> {
  const cfg = await resolveRuntime()
  if (!configReady(cfg)) {
    throw new Error('尚未配置认证信息：请在「设置」页填写租户 ID、客户端 ID 和客户端密钥')
  }
  const key = [cfg.authority, cfg.tenantId, cfg.clientId, cfg.clientSecret, cfg.resource].join('|')
  if (!force && cache && cache.key === key && Date.now() < cache.expiresAt) {
    return cache.token
  }

  const tokenUrl = `${cfg.authority}/${cfg.tenantId}/oauth2/token`
  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      resource: cfg.resource,
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    let detail = text
    try {
      const j = JSON.parse(text)
      detail = j.error_description || j.error || text
    } catch {
      /* 保留原文 */
    }
    throw new Error(`获取访问令牌失败 (HTTP ${res.status})：${detail}`)
  }

  const data = (await res.json()) as { access_token: string; expires_in: string | number }
  const expiresIn = Number(data.expires_in) || 3600
  cache = {
    key,
    token: data.access_token,
    expiresAt: Date.now() + (expiresIn - 60) * 1000,
  }
  return cache.token
}

/** 配置变更后使缓存失效 */
export function invalidateToken() {
  cache = null
}
