import fs from 'fs'
import path from 'path'
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto'
import { CLOUD_PRESETS, isCloudEnv } from './cloud'
import type { AuthType, CloudEnv, RuntimeConfig } from './types'
import { isSafePbiUrl } from './validation'

const DATA_DIR = path.join(process.cwd(), 'data')
const CONFIG_FILE = path.join(DATA_DIR, 'config.json')
const ENCRYPTED_PREFIX = 'enc:v1:'

/** 一个租户环境 = 一套云端、租户与认证凭据。 */
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

function configEncryptionKey(): Buffer | null {
  const raw = process.env.PBI_CONFIG_ENCRYPTION_KEY
  return raw ? createHash('sha256').update(raw).digest() : null
}

function encryptSecret(value: string): string {
  if (!value || value.startsWith(ENCRYPTED_PREFIX)) return value
  const key = configEncryptionKey()
  if (!key) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        '生产环境保存凭据必须设置 PBI_CONFIG_ENCRYPTION_KEY；如只使用环境变量配置，则无需写入 data/config.json。',
      )
    }
    return value
  }

  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${ENCRYPTED_PREFIX}${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`
}

function decryptSecret(value: string): string {
  if (!value || !value.startsWith(ENCRYPTED_PREFIX)) return value
  const key = configEncryptionKey()
  if (!key) {
    throw new Error('配置文件包含加密凭据，但未设置 PBI_CONFIG_ENCRYPTION_KEY，无法解密。')
  }
  const payload = value.slice(ENCRYPTED_PREFIX.length)
  const [ivRaw, tagRaw, encryptedRaw] = payload.split('.')
  if (!ivRaw || !tagRaw || !encryptedRaw) {
    throw new Error('配置文件中的加密凭据格式无效。')
  }
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivRaw, 'base64url'))
    decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'))
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedRaw, 'base64url')),
      decipher.final(),
    ]).toString('utf8')
  } catch {
    throw new Error('配置凭据解密失败，请确认 PBI_CONFIG_ENCRYPTION_KEY 与保存配置时一致。')
  }
}

/** 环境变量兜底环境：不写入配置文件，适合容器/秘密管理系统注入。 */
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

function decodeEnvironment(e: Environment): Environment {
  return {
    ...e,
    authType: e.authType ?? 'servicePrincipal',
    clientSecret: decryptSecret(String(e.clientSecret ?? '')),
    password: e.password ? decryptSecret(String(e.password)) : undefined,
  }
}

function readConfigFile(): ConfigFile {
  if (!fs.existsSync(CONFIG_FILE)) return { version: 2, environments: [] }

  let saved: Record<string, unknown>
  try {
    saved = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8')) as Record<string, unknown>
  } catch {
    throw new Error('配置文件 data/config.json 无法解析，请检查 JSON 是否损坏。')
  }

  if (Array.isArray(saved.environments)) {
    return {
      version: 2,
      activeEnvId: typeof saved.activeEnvId === 'string' ? saved.activeEnvId : undefined,
      environments: (saved.environments as Environment[]).map(decodeEnvironment),
    }
  }

  // v1 扁平格式 → 迁移为单环境。迁移写盘仍遵守生产环境的凭据加密要求。
  if ('tenantId' in saved) {
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

  return { version: 2, environments: [] }
}

function writeConfigFile(cfg: ConfigFile) {
  fs.mkdirSync(DATA_DIR, { recursive: true })
  const persisted: ConfigFile = {
    ...cfg,
    environments: cfg.environments.map((env) => ({
      ...env,
      clientSecret: env.clientSecret ? encryptSecret(env.clientSecret) : '',
      password: env.password ? encryptSecret(env.password) : undefined,
    })),
  }
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(persisted, null, 2), 'utf-8')
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

/** 新建或更新环境；密钥/密码留空时沿用旧值。 */
export function saveEnvironment(input: Partial<Environment> & { id?: string }): Environment {
  const cfg = readConfigFile()
  if (input.id !== undefined && !/^[A-Za-z0-9_-]{1,200}$/.test(input.id)) {
    throw new Error('环境 ID 格式无效')
  }

  const authorityOverride = normalizeOverride(input.authorityOverride, '认证地址')
  const apiBaseOverride = normalizeOverride(input.apiBaseOverride, 'API 基地址')
  const resourceOverride = normalizeOverride(input.resourceOverride, 'Token Resource')
  const xmlaEndpointOverride = normalizeOverride(input.xmlaEndpointOverride, 'XMLA 地址')
  let env = input.id ? cfg.environments.find((e) => e.id === input.id) : undefined

  if (env) {
    env.name = (input.name ?? env.name).trim() || env.name
    if (isCloudEnv(input.cloud)) env.cloud = input.cloud
    if (isAuthType(input.authType)) env.authType = input.authType
    env.tenantId = (input.tenantId ?? env.tenantId).trim()
    env.clientId = (input.clientId ?? env.clientId).trim()
    if (typeof input.clientSecret === 'string' && input.clientSecret.trim()) {
      env.clientSecret = input.clientSecret.trim()
    }
    env.username = (input.username ?? env.username)?.trim() || undefined
    if (typeof input.password === 'string' && input.password.length > 0) {
      env.password = input.password
    }
    env.authorityOverride = authorityOverride
    env.apiBaseOverride = apiBaseOverride
    env.resourceOverride = resourceOverride
    env.xmlaEndpointOverride = xmlaEndpointOverride
  } else {
    env = {
      id: input.id || newId(),
      name: (input.name ?? '').trim() || '未命名环境',
      cloud: isCloudEnv(input.cloud) ? input.cloud : 'global',
      authType: isAuthType(input.authType) ? input.authType : 'servicePrincipal',
      tenantId: (input.tenantId ?? '').trim(),
      clientId: (input.clientId ?? '').trim(),
      clientSecret: (input.clientSecret ?? '').trim(),
      username: input.username?.trim() || undefined,
      password: typeof input.password === 'string' && input.password.length > 0 ? input.password : undefined,
      authorityOverride,
      apiBaseOverride,
      resourceOverride,
      xmlaEndpointOverride,
    }
    cfg.environments.push(env)
  }

  // 当前 ROPC 实现是公共客户端流程，不需要也不应持久化 client_secret。
  if (env.authType === 'password') {
    env.clientSecret = ''
  } else {
    env.username = undefined
    env.password = undefined
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

/** 解析运行时配置：激活环境 + 云预设端点 + 可选覆盖项。 */
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

/** 返回给前端的环境信息，敏感凭据只返回是否已保存及预览。 */
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
    throw new Error(`${label} 必须是安全的 HTTPS Power BI/Microsoft URL，且不能包含凭据、查询参数、片段或本地地址`)
  }
  return normalized
}
