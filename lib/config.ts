import fs from 'fs'
import path from 'path'
import { CLOUD_PRESETS, isCloudEnv } from './cloud'
import type { AppConfig, RuntimeConfig } from './types'

const DATA_DIR = path.join(process.cwd(), 'data')
const CONFIG_FILE = path.join(DATA_DIR, 'config.json')

/** 环境变量提供默认值，config.json 的保存值优先 */
function fromEnv(): AppConfig {
  const cloud = process.env.PBI_CLOUD
  return {
    cloud: isCloudEnv(cloud) ? cloud : 'global',
    tenantId: process.env.PBI_TENANT_ID ?? '',
    clientId: process.env.PBI_CLIENT_ID ?? '',
    clientSecret: process.env.PBI_CLIENT_SECRET ?? '',
  }
}

export async function loadConfig(): Promise<AppConfig> {
  const env = fromEnv()
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const saved = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8')) as Partial<AppConfig>
      return {
        cloud: isCloudEnv(saved.cloud) ? saved.cloud : env.cloud,
        tenantId: saved.tenantId || env.tenantId,
        clientId: saved.clientId || env.clientId,
        clientSecret: saved.clientSecret || env.clientSecret,
        authorityOverride: saved.authorityOverride || undefined,
        apiBaseOverride: saved.apiBaseOverride || undefined,
        resourceOverride: saved.resourceOverride || undefined,
      }
    }
  } catch {
    // 配置文件损坏时回退到环境变量
  }
  return env
}

export async function saveConfig(patch: Partial<AppConfig>): Promise<AppConfig> {
  const current = await loadConfig()
  const next: AppConfig = {
    cloud: isCloudEnv(patch.cloud) ? patch.cloud : current.cloud,
    tenantId: (patch.tenantId ?? current.tenantId).trim(),
    clientId: (patch.clientId ?? current.clientId).trim(),
    // 密钥留空表示沿用旧值（前端不回显完整密钥）
    clientSecret: (patch.clientSecret && patch.clientSecret.trim()) || current.clientSecret,
    authorityOverride: patch.authorityOverride?.trim() || undefined,
    apiBaseOverride: patch.apiBaseOverride?.trim() || undefined,
    resourceOverride: patch.resourceOverride?.trim() || undefined,
  }
  fs.mkdirSync(DATA_DIR, { recursive: true })
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(next, null, 2), 'utf-8')
  return next
}

/** 解析运行时配置：云预置端点 + 覆盖项 */
export async function resolveRuntime(): Promise<RuntimeConfig> {
  const cfg = await loadConfig()
  const preset = CLOUD_PRESETS[cfg.cloud]
  return {
    ...cfg,
    authority: cfg.authorityOverride?.replace(/\/+$/, '') || preset.authority,
    apiBase: cfg.apiBaseOverride?.replace(/\/+$/, '') || preset.apiBase,
    resource: cfg.resourceOverride || preset.resource,
  }
}

/** 校验配置是否完整 */
export function configReady(cfg: RuntimeConfig): boolean {
  return Boolean(cfg.tenantId && cfg.clientId && cfg.clientSecret)
}

/** 返回给前端的配置（密钥脱敏） */
export function maskConfig(cfg: AppConfig) {
  const secretLen = cfg.clientSecret.length
  return {
    cloud: cfg.cloud,
    tenantId: cfg.tenantId,
    clientId: cfg.clientId,
    authorityOverride: cfg.authorityOverride ?? '',
    apiBaseOverride: cfg.apiBaseOverride ?? '',
    resourceOverride: cfg.resourceOverride ?? '',
    hasSecret: secretLen > 0,
    secretPreview: secretLen > 0 ? `••••${cfg.clientSecret.slice(-4)}` : '',
  }
}
