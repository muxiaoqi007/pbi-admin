import fs from 'fs'
import path from 'path'
import { CLOUD_PRESETS, isCloudEnv } from './cloud'
import type { AuthType, CloudEnv, RuntimeConfig } from './types'
import { isSafePbiUrl } from './validation'

const DATA_DIR = path.join(process.cwd(), 'data')
const CONFIG_FILE = path.join(DATA_DIR, 'config.json')

/** 涓€涓鎴风幆澧?= 涓€濂椾簯绔?+ 绉熸埛 + 鏈嶅姟涓讳綋鍑嵁 */
export interface Environment {
  id: string
  name: string
  cloud: CloudEnv
  authType: AuthType
  tenantId: string
  clientId: string
  clientSecret: string
  username?: string
  password?: string
  authorityOverride?: string
  apiBaseOverride?: string
  resourceOverride?: string
  xmlaEndpointOverride?: string
}

interface ConfigFile {
  version: 2
  activeEnvId?: string
  environments: Environment[]
}

function newId(): string {
  return `env-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/** 鐜鍙橀噺鍏滃簳鐜锛堟湭淇濆瓨鍒版枃浠讹紝浣滀负鍒濆榛樿鍊硷級 */
function envFromEnvVars(): Environment {
  const cloud = process.env.PBI_CLOUD
  return {
    id: 'env-from-env',
    name: '环境变量默认',
    cloud: isCloudEnv(cloud) ? cloud : 'global',
    authType: 'servicePrincipal',
    tenantId: process.env.PBI_TENANT_ID ?? '',
    clientId: process.env.PBI_CLIENT_ID ?? '',
    clientSecret: process.env.PBI_CLIENT_SECRET ?? '',
  }
}

function readConfigFile(): ConfigFile {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const saved = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8')) as Record<string, unknown>
      if (saved && Array.isArray(saved.environments)) {
        return {
          version: 2,
          activeEnvId: typeof saved.activeEnvId === 'string' ? saved.activeEnvId : undefined,
          environments: (saved.environments as Environment[]).map((e) => ({
            ...e,
            authType: e.authType ?? 'servicePrincipal',
          })),
        }
      }
      // v1 鎵佸钩鏍煎紡 鈫?鑷姩杩佺Щ涓哄崟鐜
      if (saved && typeof saved === 'object' && 'tenantId' in saved) {
        const env: Environment = {
          id: newId(),
          name: '默认环境',
          cloud: isCloudEnv(saved.cloud) ? saved.cloud : 'global',
          authType: 'servicePrincipal',
          tenantId: String(saved.tenantId ?? ''),
          clientId: String(saved.clientId ?? ''),
          clientSecret: String(saved.clientSecret ?? ''),
          authorityOverride: saved.authorityOverride ? String(saved.authorityOverride) : undefined,
          apiBaseOverride: saved.apiBaseOverride ? String(saved.apiBaseOverride) : undefined,
          resourceOverride: saved.resourceOverride ? String(saved.resourceOverride) : undefined,
          xmlaEndpointOverride: saved.xmlaEndpointOverride ? String(saved.xmlaEndpointOverride) : undefined,
        }
        const cfg: ConfigFile = { version: 2, activeEnvId: env.id, environments: [env] }
        writeConfigFile(cfg)
        return cfg
      }
    }
  } catch {
    /* 閰嶇疆鏂囦欢鎹熷潖鏃惰涓虹┖閰嶇疆 */
  }
  return { version: 2, environments: [] }
}

function writeConfigFile(cfg: ConfigFile) {
  fs.mkdirSync(DATA_DIR, { recursive: true })
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf-8')
}

export function listEnvironments(): { environments: Environment[]; activeEnvId?: string } {
  const cfg = readConfigFile()
  if (cfg.environments.length === 0) {
    const env = envFromEnvVars()
    if (env.tenantId && env.clientId && env.clientSecret) {
      return { environments: [env], activeEnvId: env.id }
    }
  }
  if (cfg.environments.length > 0 && !cfg.environments.some((e) => e.id === cfg.activeEnvId)) {
    cfg.activeEnvId = cfg.environments[0].id
  }
  return { environments: cfg.environments, activeEnvId: cfg.activeEnvId }
}

export function getActiveEnvironment(): Environment | null {
  const { environments, activeEnvId } = listEnvironments()
  return environments.find((e) => e.id === activeEnvId) ?? environments[0] ?? null
}

/** 鏂板缓鎴栨洿鏂扮幆澧冿紙鏈?id 涓斿瓨鍦ㄥ垯鏇存柊锛屽惁鍒欐柊寤猴級锛泂ecret 鐣欑┖娌跨敤鏃у€?*/
export function saveEnvironment(input: Partial<Environment> & { id?: string }): Environment {
  const cfg = readConfigFile()
  if (input.id !== undefined && !/^[A-Za-z0-9_-]{1,200}$/.test(input.id)) {
    throw new Error('invalid environment id')
  }
  const authorityOverride = normalizeOverride(input.authorityOverride, '璁よ瘉鍦板潃')
  const apiBaseOverride = normalizeOverride(input.apiBaseOverride, 'API 鍩哄湴鍧€')
  const resourceOverride = normalizeOverride(input.resourceOverride, 'Token Resource')
  const xmlaEndpointOverride = normalizeOverride(input.xmlaEndpointOverride, 'XMLA 鍦板潃')
  let env = input.id ? cfg.environments.find((e) => e.id === input.id) : undefined
  if (env) {
    env.name = (input.name ?? env.name).trim() || env.name
    if (isCloudEnv(input.cloud)) env.cloud = input.cloud
    if (isAuthType(input.authType)) env.authType = input.authType
    env.tenantId = (input.tenantId ?? env.tenantId).trim()
    env.clientId = (input.clientId ?? env.clientId).trim()
    env.clientSecret = (input.clientSecret && input.clientSecret.trim()) || env.clientSecret
    env.username = (input.username ?? env.username)?.trim() || undefined
    env.password = (input.password && input.password.trim()) || env.password
    env.authorityOverride = authorityOverride
    env.apiBaseOverride = apiBaseOverride
    env.resourceOverride = resourceOverride
    env.xmlaEndpointOverride = xmlaEndpointOverride
  } else {
    env = {
      id: input.id || newId(),
      name: (input.name ?? '').trim() || 'unnamed',
      cloud: isCloudEnv(input.cloud) ? input.cloud : 'global',
      authType: isAuthType(input.authType) ? input.authType : 'servicePrincipal',
      tenantId: (input.tenantId ?? '').trim(),
      clientId: (input.clientId ?? '').trim(),
      clientSecret: (input.clientSecret ?? '').trim(),
      username: input.username?.trim() || undefined,
      password: input.password?.trim() || undefined,
      authorityOverride,
      apiBaseOverride,
      resourceOverride,
      xmlaEndpointOverride,
    }
    cfg.environments.push(env)
  }
  writeConfigFile(cfg)
  return env
}

export function deleteEnvironment(id: string): void {
  const cfg = readConfigFile()
  cfg.environments = cfg.environments.filter((e) => e.id !== id)
  if (cfg.activeEnvId === id) {
    cfg.activeEnvId = cfg.environments[0]?.id
  }
  writeConfigFile(cfg)
}

export function setActiveEnvironment(id: string): boolean {
  const cfg = readConfigFile()
  if (!cfg.environments.some((e) => e.id === id)) return false
  cfg.activeEnvId = id
  writeConfigFile(cfg)
  return true
}

/** 瑙ｆ瀽杩愯鏃堕厤缃細婵€娲荤幆澧?+ 浜戦缃鐐?+ 瑕嗙洊椤?*/
export async function resolveRuntime(): Promise<RuntimeConfig> {
  const env = getActiveEnvironment()
  const preset = env ? CLOUD_PRESETS[env.cloud] : CLOUD_PRESETS.global
  const authorityOverride = isSafePbiUrl(env?.authorityOverride)
    ? env.authorityOverride.replace(/\/+$/, '')
    : undefined
  const apiBaseOverride = isSafePbiUrl(env?.apiBaseOverride)
    ? env.apiBaseOverride.replace(/\/+$/, '')
    : undefined
  const resourceOverride = isSafePbiUrl(env?.resourceOverride) ? env.resourceOverride : undefined
  const xmlaEndpointOverride = isSafePbiUrl(env?.xmlaEndpointOverride)
    ? env.xmlaEndpointOverride.replace(/\/+$/, '')
    : undefined
  return {
    envId: env?.id ?? '',
    envName: env?.name ?? '',
    cloud: env?.cloud ?? 'global',
    authType: env?.authType ?? 'servicePrincipal',
    tenantId: env?.tenantId ?? '',
    clientId: env?.clientId ?? '',
    clientSecret: env?.clientSecret ?? '',
    username: env?.username,
    password: env?.password,
    authority: authorityOverride || preset.authority,
    apiBase: apiBaseOverride || preset.apiBase,
    resource: resourceOverride || preset.resource,
    xmlaEndpointOverride,
  }
}

export function configReady(cfg: RuntimeConfig): boolean {
  const hasTenant = Boolean(cfg.tenantId && cfg.clientId)
  if (cfg.authType === 'password') return Boolean(hasTenant && cfg.username && cfg.password)
  return Boolean(hasTenant && cfg.clientSecret)
}

/** 杩斿洖缁欏墠绔殑鐜淇℃伅锛堝瘑閽ヨ劚鏁忥級 */
export function maskEnvironment(e: Environment) {
  const secretLen = e.clientSecret.length
  const pwdLen = e.password?.length ?? 0
  return {
    id: e.id,
    name: e.name,
    cloud: e.cloud,
    authType: e.authType ?? 'servicePrincipal',
    tenantId: e.tenantId,
    clientId: e.clientId,
    username: e.username ?? '',
    authorityOverride: e.authorityOverride ?? '',
    apiBaseOverride: e.apiBaseOverride ?? '',
    resourceOverride: e.resourceOverride ?? '',
    xmlaEndpointOverride: e.xmlaEndpointOverride ?? '',
    hasSecret: secretLen > 0,
    secretPreview: secretLen > 0 ? `••••${e.clientSecret.slice(-4)}` : '',
    hasPassword: pwdLen > 0,
    passwordPreview: pwdLen > 0 ? '••••已保存' : '',
  }
}

function isAuthType(v: unknown): v is AuthType {
  return v === 'servicePrincipal' || v === 'password'
}
function normalizeOverride(value: unknown, label: string): string | undefined {
  if (value === undefined || value === null || value === '') return undefined
  const normalized = typeof value === 'string' ? value.trim() : ''
  if (!isSafePbiUrl(normalized)) {
    throw new Error(label + '蹇呴』鏄畨鍏ㄧ殑 HTTPS URL锛屼笖涓嶈兘鍖呭惈鍑嵁銆佹煡璇㈠弬鏁版垨鏈湴鍦板潃')
  }
  return normalized
}
