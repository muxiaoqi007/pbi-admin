import type { CloudEnv } from './types'

export interface CloudPreset {
  value: CloudEnv
  label: string
  /** OAuth 认证地址（不含 tenant） */
  authority: string
  /** Power BI REST API 基地址 */
  apiBase: string
  /** client_credentials 获取 token 用的 resource（v1 认证流） */
  resource: string
  /** 应用注册门户 */
  portal: string
  /** Power BI 服务地址 */
  serviceUrl: string
}

export const CLOUD_PRESETS: Record<CloudEnv, CloudPreset> = {
  global: {
    value: 'global',
    label: '国际版（Global）',
    authority: 'https://login.microsoftonline.com',
    apiBase: 'https://api.powerbi.com/v1.0/myorg',
    resource: 'https://analysis.windows.net/powerbi/api',
    portal: 'https://portal.azure.com',
    serviceUrl: 'https://app.powerbi.com',
  },
  china: {
    value: 'china',
    label: '世纪互联（21Vianet）',
    authority: 'https://login.chinacloudapi.cn',
    apiBase: 'https://api.powerbi.cn/v1.0/myorg',
    resource: 'https://analysis.chinacloudapi.cn/powerbi/api',
    portal: 'https://portal.azure.cn',
    serviceUrl: 'https://app.powerbi.cn',
  },
}

export function isCloudEnv(v: unknown): v is CloudEnv {
  return v === 'global' || v === 'china'
}
