import dayjs from 'dayjs'

export function formatDateTime(value?: string): string {
  return value ? dayjs(value).format('YYYY-MM-DD HH:mm') : '-'
}

export function formatDateTimeSeconds(value?: string): string {
  return value ? dayjs(value).format('YYYY-MM-DD HH:mm:ss') : '-'
}

export function formatAgeDays(value?: string): number | undefined {
  if (!value) return undefined
  const days = dayjs().diff(dayjs(value), 'day')
  return Number.isFinite(days) ? days : undefined
}

/** 兼容 Power BI 的 {errorCode,errorDescription} 与 {error:{message}} 两种错误体。 */
export function parseRefreshError(raw?: string): string | undefined {
  if (!raw) return undefined
  try {
    const parsed = JSON.parse(raw) as {
      errorCode?: string
      errorDescription?: string
      error?: { message?: string }
      message?: string
    }
    if (parsed.errorCode || parsed.errorDescription) {
      return [parsed.errorCode, parsed.errorDescription].filter(Boolean).join('：')
    }
    return parsed.error?.message ?? parsed.message ?? raw
  } catch {
    return raw
  }
}

export function formatDurationSeconds(seconds?: number): string {
  if (seconds === undefined) return '-'
  if (seconds < 60) return `${Math.round(seconds)}s`
  const minutes = Math.floor(seconds / 60)
  const rest = Math.round(seconds % 60)
  if (minutes < 60) return `${minutes}m ${rest}s`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ${minutes % 60}m`
}
