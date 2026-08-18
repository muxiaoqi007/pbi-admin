import { getAccessToken } from './auth'
import { resolveRuntime } from './config'
import type { DatasetSchema, SchemaColumn, SchemaMeasure, SchemaPartition, SchemaTable } from './types'

export class XmlaError extends Error {
  status: number
  code?: string
  details?: Record<string, unknown>
  constructor(message: string, status = 502, code?: string, details?: Record<string, unknown>) {
    super(message); this.status = status; this.code = code; this.details = details
  }
}

function xmlDecode(value: string): string {
  return value.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
}
function rows(xml: string): Record<string, string>[] {
  return Array.from(xml.matchAll(/<(?:row|Row)(?:\s[^>]*)?>([\s\S]*?)<\/(?:row|Row)>/g)).map((match) => {
    const result: Record<string, string> = {}
    for (const cell of match[1].matchAll(/<([A-Za-z_][\w.-]*)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/g)) result[cell[1]] = xmlDecode(cell[2].replace(/<[^>]+>/g, '').trim())
    return result
  })
}
function field(row: Record<string, string>, ...names: string[]): string {
  const key = Object.keys(row).find((candidate) => names.some((name) => candidate.toLowerCase() === name.toLowerCase()))
  return key ? row[key] : ''
}
async function workspaceName(workspaceId: string): Promise<string> {
  const runtime = await resolveRuntime()
  const token = await getAccessToken()
  const response = await fetch(runtime.apiBase + '/groups/' + workspaceId, { headers: { Authorization: 'Bearer ' + token }, cache: 'no-store' })
  if (!response.ok) throw new XmlaError('无法读取工作区名称（HTTP ' + response.status + '）', response.status, 'WORKSPACE_LOOKUP_FAILED')
  const data = (await response.json()) as { name?: string }
  if (!data.name) throw new XmlaError('工作区未返回名称，无法构造 XMLA 地址', 502, 'WORKSPACE_NAME_MISSING')
  return data.name
}
function endpoint(runtime: Awaited<ReturnType<typeof resolveRuntime>>, name: string): string {
  const host = runtime.cloud === 'china' ? 'api.powerbi.cn' : 'api.powerbi.com'
  return 'https://' + host + '/v1.0/myorg/' + encodeURIComponent(name)
}
function endpointCandidates(runtime: Awaited<ReturnType<typeof resolveRuntime>>, name: string): string[] {
  const configured = runtime.xmlaEndpointOverride?.replace(/\/+$/, '')
  const base = endpoint(runtime, name)
  return Array.from(new Set([
    configured ? configured.replace(/\{workspace\}/gi, encodeURIComponent(name)) : '',
    base,
    base + '/xmla',
  ].filter(Boolean)))
}
async function execute(endpointUrl: string, catalog: string, statement: string): Promise<Record<string, string>[]> {
  const token = await getAccessToken()
  const escape = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  const body = '<?xml version="1.0" encoding="utf-8"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Header/><s:Body><Execute xmlns="urn:schemas-microsoft-com:xml-analysis"><Command><Statement>' + escape(statement) + '</Statement></Command><Properties><PropertyList><Catalog>' + escape(catalog) + '</Catalog><Format>Tabular</Format><AxisFormat>ClusterFormat</AxisFormat></PropertyList></Properties></Execute></s:Body></s:Envelope>'
  const response = await fetch(endpointUrl, { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: '' }, body, cache: 'no-store' })
  const text = await response.text()
  if (!response.ok) {
    const message = xmlDecode(text.match(/<Message[^>]*>([\s\S]*?)<\/Message>/i)?.[1] ?? text).replace(/<[^>]+>/g, '').trim()
    throw new XmlaError('XMLA DMV 查询失败（HTTP ' + response.status + '）：' + message.slice(0, 500), response.status, 'XMLA_HTTP_ERROR', { endpoint: endpointUrl, statement })
  }
  if (/<Fault|<Error\b/i.test(text)) throw new XmlaError('XMLA DMV 查询返回 Fault/Error', 403, 'XMLA_FAULT', { endpoint: endpointUrl, statement })
  return rows(text)
}
function schemaFromRows(tableRows: Record<string, string>[], columnRows: Record<string, string>[], measureRows: Record<string, string>[], partitionRows: Record<string, string>[], expressionRows: Record<string, string>[]): DatasetSchema {
  const tableMap = new Map<string, SchemaTable>()
  for (const row of tableRows) {
    const name = field(row, 'Name', 'TABLE_NAME')
    if (name) tableMap.set(field(row, 'ID', 'TABLE_ID') || name, { name, isHidden: ['true', '1'].includes(field(row, 'IsHidden').toLowerCase()), columns: [], measures: [], partitions: [] })
  }
  const tableFor = (row: Record<string, string>) => tableMap.get(field(row, 'TableID', 'TABLE_ID', 'Table', 'TableName')) ?? tableMap.get(field(row, 'Table', 'TableName'))
  for (const row of columnRows) { const table = tableFor(row); const name = field(row, 'Name', 'COLUMN_NAME'); if (table && name) (table.columns ??= []).push({ name, dataType: field(row, 'DataType', 'DATA_TYPE'), isHidden: ['true', '1'].includes(field(row, 'IsHidden').toLowerCase()) } as SchemaColumn) }
  for (const row of measureRows) { const table = tableFor(row); const name = field(row, 'Name', 'MEASURE_NAME'); if (table && name) (table.measures ??= []).push({ name, expression: field(row, 'Expression', 'MEASURE_EXPRESSION') } as SchemaMeasure) }
  for (const row of partitionRows) { const table = tableFor(row); const name = field(row, 'Name', 'PARTITION_NAME'); if (table && name) (table.partitions ??= []).push({ name, expression: field(row, 'Expression', 'SOURCE_EXPRESSION') } as SchemaPartition) }
  const expressions = expressionRows.map((row) => ({ name: field(row, 'Name'), expression: field(row, 'Expression') })).filter((row) => row.name || row.expression)
  const tables = Array.from(tableMap.values())
  return { tables, expressions, measureCount: tables.reduce((n, t) => n + (t.measures?.length ?? 0), 0), columnCount: tables.reduce((n, t) => n + (t.columns?.length ?? 0), 0) }
}
export async function getDatasetSchemaViaXmla(workspaceId: string, datasetName: string): Promise<DatasetSchema> {
  const runtime = await resolveRuntime()
  const ws = await workspaceName(workspaceId)
  const candidates = endpointCandidates(runtime, ws)
  let lastError: unknown
  let url = candidates[0]
  let tableRows: Record<string, string>[] = []
  for (const candidate of candidates) {
    try { tableRows = await execute(candidate, datasetName, 'SELECT * FROM $SYSTEM.TMSCHEMA_TABLES'); url = candidate; break } catch (error) { lastError = error }
  }
  if (tableRows.length === 0 && lastError instanceof XmlaError) throw new XmlaError(lastError.message, lastError.status, lastError.code, { ...(lastError.details ?? {}), workspaceName: ws, datasetName, candidates })
  const optional = async (query: string) => { try { return await execute(url, datasetName, query) } catch { return [] } }
  const [columns, measures, partitions, expressions] = await Promise.all([optional('SELECT * FROM $SYSTEM.TMSCHEMA_COLUMNS'), optional('SELECT * FROM $SYSTEM.TMSCHEMA_MEASURES'), optional('SELECT * FROM $SYSTEM.TMSCHEMA_PARTITIONS'), optional('SELECT * FROM $SYSTEM.TMSCHEMA_EXPRESSIONS')])
  const schema = schemaFromRows(tableRows, columns, measures, partitions, expressions)
  if (schema.tables.length === 0) throw new XmlaError('XMLA 连接成功，但 DMV 未返回表', 422, 'XMLA_EMPTY_SCHEMA', { endpoint: url, workspaceName: ws, datasetName })
  return schema
}
export async function getDatasetSchemaViaXmlaDiagnostics(workspaceId: string, datasetName: string) {
  const runtime = await resolveRuntime()
  const ws = await workspaceName(workspaceId)
  const candidates = endpointCandidates(runtime, ws)
  const attempts: Array<Record<string, unknown>> = []
  for (const candidate of candidates) {
    try { const tableRows = await execute(candidate, datasetName, 'SELECT * FROM $SYSTEM.TMSCHEMA_TABLES'); return { ok: true, workspaceName: ws, datasetName, endpoint: candidate, tableCount: tableRows.length, tables: tableRows, attempts } }
    catch (error) { attempts.push({ endpoint: candidate, status: error instanceof XmlaError ? error.status : 502, message: error instanceof Error ? error.message : String(error) }) }
  }
  throw new XmlaError('所有 XMLA transport endpoint 均失败', 502, 'XMLA_ENDPOINT_UNAVAILABLE', { workspaceName: ws, datasetName, candidates, attempts, cloud: runtime.cloud })
}


