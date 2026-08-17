import { configReady, resolveRuntime } from './config'

interface TokenCache {
  key: string
  token: string
  expiresAt: number // 毫秒时间戳
}

let cache: TokenCache | null = null

export interface AccessTokenDiagnostics {
  authType: 'service_principal' | 'delegated_user' | 'unknown'
  tokenVersion?: string
  audience?: string
  issuer?: string
  tenantId?: string
  clientId?: string
  /** Microsoft Entra service-principal object ID (the token's oid claim). */
  objectId?: string
  roles: string[]
  scopes: string[]
}

function decodeTokenDiagnostics(token: string): AccessTokenDiagnostics {
  try {
    const payload = JSON.parse(
      Buffer.from(token.split('.')[1], 'base64url').toString('utf8'),
    ) as Record<string, unknown>
    const roles = Array.isArray(payload.roles)
      ? payload.roles.filter((value): value is string => typeof value === 'string')
      : []
    const scopes = typeof payload.scp === 'string' ? payload.scp.split(' ').filter(Boolean) : []
    return {
      authType:
        payload.idtyp === 'user' ||
        typeof payload.upn === 'string' ||
        typeof payload.preferred_username === 'string'
          ? 'delegated_user'
          : roles.length > 0 || payload.appid || payload.azp
            ? 'service_principal'
            : 'unknown',
      tokenVersion: typeof payload.ver === 'string' ? payload.ver : undefined,
      audience: typeof payload.aud === 'string' ? payload.aud : undefined,
      issuer: typeof payload.iss === 'string' ? payload.iss : undefined,
      tenantId: typeof payload.tid === 'string' ? payload.tid : undefined,
      clientId:
        typeof payload.appid === 'string'
          ? payload.appid
          : typeof payload.azp === 'string'
            ? payload.azp
            : undefined,
      objectId: typeof payload.oid === 'string' ? payload.oid : undefined,
      roles,
      scopes,
    }
  } catch {
    return { authType: 'unknown', roles: [], scopes: [] }
  }
}

/**
 * 获取访问令牌。根据环境配置的 authType 自动选择：
 * - servicePrincipal: client_credentials 流程（v2 端点 + scope）
 * - password: ROPC 资源所有者密码流程（v2 端点 + username/password + scope）
 * force=true 时强制刷新（配置变更或收到 401/403 时使用）。
 */
export async function getAccessToken(force = false): Promise<string> {
  const cfg = await resolveRuntime()
  if (!configReady(cfg)) {
    throw new Error(
      cfg.authType === 'password'
        ? '尚未配置认证信息：请在「设置」页填写租户 ID、客户端 ID、用户名和密码'
        : '尚未配置认证信息：请在「设置」页填写租户 ID、客户端 ID 和客户端密钥',
    )
  }
  const resource = cfg.resource.replace(/\/+$/, '').replace(/\/\.default$/, '')
  const scope = `${resource}/.default`
  const key = [
    cfg.authority,
    cfg.tenantId,
    cfg.clientId,
    cfg.authType,
    cfg.authType === 'password' ? cfg.username : cfg.clientSecret,
    cfg.authType === 'password' ? cfg.password : '',
    resource,
  ].join('|')
  if (!force && cache && cache.key === key && Date.now() < cache.expiresAt) {
    return cache.token
  }

  const tokenUrl = `${cfg.authority}/${cfg.tenantId}/oauth2/v2.0/token`
  const params: Record<string, string> = {
    client_id: cfg.clientId,
    scope,
  }
  if (cfg.authType === 'password') {
    params.grant_type = 'password'
    params.username = cfg.username!
    params.password = cfg.password!
  } else {
    params.grant_type = 'client_credentials'
    params.client_secret = cfg.clientSecret
  }

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
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

/** Return non-secret claims for the currently configured token. */
export async function getAccessTokenDiagnostics(force = false): Promise<AccessTokenDiagnostics> {
  return decodeTokenDiagnostics(await getAccessToken(force))
}
