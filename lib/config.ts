import fs from 'fs'
import path from 'path'
import { CLOUD_PRESETS, isCloudEnv } from './cloud'
import type { CloudEnv, RuntimeConfig } from './types'

const DATA_DIR = path.join(process.cwd(), 'data')
const CONFIG_FILE = path.join(DATA_DIR, 'config.json')

/** 一个租户环境 = 一套云端 + 租户 + 服务主体凭据 */
export interface Environment {
  id: string
  name: string
  cloud: CloudEnv
  tenantId: string
  clientId: string
  clientSecret: string
  authorityOverride?: string
  apiBaseOverride?: string
  resourceOverride?: string
}

interface ConfigFile {
  version: 2
  activeEnvId?: string
  environments: Environment[]
}

function newId(): string {
  return `env-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/** 环境变量兜底环境（未保存到文件，作为初始默认值） */
function envFromEnvVars(): Environment {
  const cloud = process.env.PBI_CLOUD
  return {
    id: 'env-from-env',
    name: '环境变量默认',
    cloud: isCloudEnv(cloud) ? cloud : 'global',
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
          environments: saved.environments as Environment[],
        }
      }
      // v1 扁平格式 → 自动迁移为单环境
      if (saved && typeof saved === 'object' && 'tenantId' in saved) {
        const env: Environment = {
          id: newId(),
          name: '默认环境',
          cloud: isCloudEnv(saved.cloud) ? saved.cloud : 'global',
          tenantId: String(saved.tenantId ?? ''),
          clientId: String(saved.clientId ?? ''),
          clientSecret: String(saved.clientSecret ?? ''),
          authorityOverride: saved.authorityOverride ? String(saved.authorityOverride) : undefined,
          apiBaseOverride: saved.apiBaseOverride ? String(saved.apiBaseOverride) : undefined,
          resourceOverride: saved.resourceOverride ? String(saved.resourceOverride) : undefined,
        }
        const cfg: ConfigFile = { version: 2, activeEnvId: env.id, environments: [env] }
        writeConfigFile(cfg)
        return cfg
      }
    }
  } catch {
    /* 配置文件损坏时视为空配置 */
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

/** 新建或更新环境（有 id 且存在则更新，否则新建）；secret 留空沿用旧值 */
export function saveEnvironment(input: Partial<Environment> & { id?: string }): Environment {
  const cfg = readConfigFile()
  let env = input.id ? cfg.environments.find((e) => e.id === input.id) : undefined
  if (env) {
    env.name = (input.name ?? env.name).trim() || env.name
    if (isCloudEnv(input.cloud)) env.cloud = input.cloud
    env.tenantId = (input.tenantId ?? env.tenantId).trim()
    env.clientId = (input.clientId ?? env.clientId).trim()
    env.clientSecret = (input.clientSecret && input.clientSecret.trim()) || env.clientSecret
    env.authorityOverride = input.authorityOverride?.trim() || undefined
    env.apiBaseOverride = input.apiBaseOverride?.trim() || undefined
    env.resourceOverride = input.resourceOverride?.trim() || undefined
  } else {
    env = {
      id: input.id || newId(),
      name: (input.name ?? '').trim() || '未命名环境',
      cloud: isCloudEnv(input.cloud) ? input.cloud : 'global',
      tenantId: (input.tenantId ?? '').trim(),
      clientId: (input.clientId ?? '').trim(),
      clientSecret: (input.clientSecret ?? '').trim(),
      authorityOverride: input.authorityOverride?.trim() || undefined,
      apiBaseOverride: input.apiBaseOverride?.trim() || undefined,
      resourceOverride: input.resourceOverride?.trim() || undefined,
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

/** 解析运行时配置：激活环境 + 云预置端点 + 覆盖项 */
export async function resolveRuntime(): Promise<RuntimeConfig> {
  const env = getActiveEnvironment()
  const preset = env ? CLOUD_PRESETS[env.cloud] : CLOUD_PRESETS.global
  return {
    envId: env?.id ?? '',
    envName: env?.name ?? '',
    cloud: env?.cloud ?? 'global',
    tenantId: env?.tenantId ?? '',
    clientId: env?.clientId ?? '',
    clientSecret: env?.clientSecret ?? '',
    authority: env?.authorityOverride?.replace(/\/+$/, '') || preset.authority,
    apiBase: env?.apiBaseOverride?.replace(/\/+$/, '') || preset.apiBase,
    resource: env?.resourceOverride || preset.resource,
  }
}

/** 校验配置是否完整 */
export function configReady(cfg: RuntimeConfig): boolean {
  return Boolean(cfg.tenantId && cfg.clientId && cfg.clientSecret)
}

/** 返回给前端的环境信息（密钥脱敏） */
export function maskEnvironment(e: Environment) {
  const secretLen = e.clientSecret.length
  return {
    id: e.id,
    name: e.name,
    cloud: e.cloud,
    tenantId: e.tenantId,
    clientId: e.clientId,
    authorityOverride: e.authorityOverride ?? '',
    apiBaseOverride: e.apiBaseOverride ?? '',
    resourceOverride: e.resourceOverride ?? '',
    hasSecret: secretLen > 0,
    secretPreview: secretLen > 0 ? `••••${e.clientSecret.slice(-4)}` : '',
  }
}
