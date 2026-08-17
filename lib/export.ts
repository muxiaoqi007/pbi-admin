'use client'

/** 导出 CSV（带 BOM，Excel 打开中文不乱码） */
export function exportCSV(
  filename: string,
  headers: string[],
  rows: (string | number | boolean | undefined | null)[][],
) {
  const esc = (v: string | number | boolean | undefined | null) => {
    const s = v === undefined || v === null ? '' : String(v)
    // Prevent spreadsheet applications from interpreting exported text as a formula.
    const safe = typeof v === 'string' && /^[\t\r ]*[=+\-@]/.test(s) ? `'${s}` : s
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
  }
  const csv = '\uFEFF' + [headers, ...rows].map((r) => r.map(esc).join(',')).join('\r\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
