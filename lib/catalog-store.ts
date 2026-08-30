import 'server-only'
import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import type { PbiDatasource, PbiTable } from './types'

const dataDir = path.join(process.cwd(), 'data')
const TABLE_CACHE_TTL_MS = 30 * 60 * 1000
const DATASOURCE_INDEX_TTL_MS = 10 * 60 * 1000

fs.mkdirSync(dataDir, { recursive: true })
const db = new Database(path.join(dataDir, 'catalog.sqlite'))
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')
db.exec(`
CREATE TABLE IF NOT EXISTS datasets (
  environment_id TEXT NOT NULL, workspace_id TEXT NOT NULL, dataset_id TEXT NOT NULL,
  workspace_name TEXT, dataset_name TEXT, updated_at TEXT NOT NULL,
  PRIMARY KEY(environment_id, workspace_id, dataset_id)
);
CREATE TABLE IF NOT EXISTS dataset_tables (
  environment_id TEXT NOT NULL, workspace_id TEXT NOT NULL, dataset_id TEXT NOT NULL,
  table_name TEXT NOT NULL, is_hidden INTEGER, source TEXT NOT NULL, updated_at TEXT NOT NULL,
  PRIMARY KEY(environment_id, workspace_id, dataset_id, table_name)
);
CREATE TABLE IF NOT EXISTS dataset_datasources (
  environment_id TEXT NOT NULL, workspace_id TEXT NOT NULL, dataset_id TEXT NOT NULL,
  datasource_key TEXT NOT NULL, datasource_type TEXT NOT NULL, primary_value TEXT NOT NULL,
  secondary_value TEXT, gateway_id TEXT, raw_json TEXT, updated_at TEXT NOT NULL,
  PRIMARY KEY(environment_id, workspace_id, dataset_id, datasource_key)
);
CREATE INDEX IF NOT EXISTS idx_tables_dataset ON dataset_tables(environment_id, dataset_id);
CREATE INDEX IF NOT EXISTS idx_sources_env ON dataset_datasources(environment_id);
CREATE TABLE IF NOT EXISTS catalog_state (environment_id TEXT NOT NULL, cache_key TEXT NOT NULL, value_json TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(environment_id,cache_key));
CREATE TABLE IF NOT EXISTS dataset_notes (
  environment_id TEXT NOT NULL, workspace_id TEXT NOT NULL, dataset_id TEXT NOT NULL,
  note TEXT NOT NULL, updated_at TEXT NOT NULL,
  PRIMARY KEY(environment_id, workspace_id, dataset_id)
);
CREATE TABLE IF NOT EXISTS column_notes (
  environment_id TEXT NOT NULL, workspace_id TEXT NOT NULL, dataset_id TEXT NOT NULL,
  table_name TEXT NOT NULL, column_name TEXT NOT NULL,
  note TEXT NOT NULL, updated_at TEXT NOT NULL,
  PRIMARY KEY(environment_id, workspace_id, dataset_id, table_name, column_name)
);
CREATE TABLE IF NOT EXISTS embed_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  environment_id TEXT NOT NULL, session_id TEXT NOT NULL,
  report_id TEXT NOT NULL, workspace_id TEXT NOT NULL,
  report_name TEXT, event_type TEXT NOT NULL, page_name TEXT, details_json TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_embed_events_env ON embed_events(environment_id, created_at);
CREATE TABLE IF NOT EXISTS portal_groups (
  environment_id TEXT NOT NULL, group_id TEXT NOT NULL,
  name TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(environment_id, group_id)
);
CREATE TABLE IF NOT EXISTS portal_group_items (
  environment_id TEXT NOT NULL, group_id TEXT NOT NULL, report_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(environment_id, group_id, report_id, workspace_id)
);
`)

function isFresh(timestamp: string, ttlMs: number): boolean {
  const at = Date.parse(timestamp)
  return Number.isFinite(at) && Date.now() - at < ttlMs
}

export function saveDatasetTables(input: { environmentId: string; workspaceId: string; datasetId: string; datasetName?: string; workspaceName?: string; source: string; tables: PbiTable[]; fetchedAt: string }) {
  const row = { ...input, datasetName: input.datasetName ?? null, workspaceName: input.workspaceName ?? null }
  const tx = db.transaction(() => {
    db.prepare(`INSERT INTO datasets VALUES (@environmentId,@workspaceId,@datasetId,@workspaceName,@datasetName,@fetchedAt)
      ON CONFLICT(environment_id,workspace_id,dataset_id) DO UPDATE SET workspace_name=COALESCE(excluded.workspace_name,datasets.workspace_name),dataset_name=COALESCE(excluded.dataset_name,datasets.dataset_name),updated_at=excluded.updated_at`).run(row)
    db.prepare('DELETE FROM dataset_tables WHERE environment_id=? AND workspace_id=? AND dataset_id=?').run(input.environmentId, input.workspaceId, input.datasetId)
    const insert = db.prepare('INSERT INTO dataset_tables VALUES (?,?,?,?,?,?,?)')
    for (const table of input.tables) insert.run(input.environmentId, input.workspaceId, input.datasetId, table.name, table.isHidden == null ? null : Number(table.isHidden), input.source, input.fetchedAt)
  })
  tx()
}

export function saveDatasetCatalog(environmentId: string, datasets: Array<{ id: string; name: string; workspaceId: string; workspaceName: string }>, fetchedAt: string) {
  const upsert = db.prepare(`INSERT INTO datasets VALUES (?,?,?,?,?,?) ON CONFLICT(environment_id,workspace_id,dataset_id)
    DO UPDATE SET workspace_name=excluded.workspace_name,dataset_name=excluded.dataset_name,updated_at=excluded.updated_at`)
  db.transaction(() => {
    for (const d of datasets) upsert.run(environmentId, d.workspaceId, d.id, d.workspaceName, d.name, fetchedAt)
  })()
}

export function loadDatasetTables(environmentId: string, workspaceId: string, datasetId: string): { tables: PbiTable[]; source: string; fetchedAt: string } | null {
  const rows = db.prepare(`SELECT table_name,is_hidden,source,updated_at FROM dataset_tables
    WHERE environment_id=? AND workspace_id=? AND dataset_id=? ORDER BY table_name`).all(environmentId, workspaceId, datasetId) as Array<{table_name:string;is_hidden:number|null;source:string;updated_at:string}>
  if (!rows.length || !isFresh(rows[0].updated_at, TABLE_CACHE_TTL_MS)) return null
  return { tables: rows.map(r => ({ name: r.table_name, isHidden: r.is_hidden == null ? undefined : Boolean(r.is_hidden) })), source: rows[0].source, fetchedAt: rows[0].updated_at }
}

export function saveDatasetDatasources(environmentId: string, workspaceId: string, datasetId: string, list: PbiDatasource[], fetchedAt: string) {
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM dataset_datasources WHERE environment_id=? AND workspace_id=? AND dataset_id=?').run(environmentId, workspaceId, datasetId)
    const insert = db.prepare('INSERT INTO dataset_datasources VALUES (?,?,?,?,?,?,?,?,?,?)')
    for (const source of list) {
      const cd = source.connectionDetails ?? {}
      const primary = cd.server ?? cd.path ?? cd.url ?? source.name ?? '(未知)'
      const secondary = cd.database ?? cd.kind ?? null
      const key = `${source.datasourceType}|${primary}|${secondary ?? ''}`
      insert.run(environmentId, workspaceId, datasetId, key, source.datasourceType, primary, secondary, source.gatewayId ?? null, JSON.stringify(source), fetchedAt)
    }
  })
  tx()
}

export function getCatalogOverview(environmentId: string) {
  const datasets = db.prepare(`SELECT d.environment_id,d.workspace_id,d.dataset_id,d.workspace_name,d.dataset_name,d.updated_at,
    COUNT(t.table_name) table_count, MAX(t.source) table_source
    FROM datasets d LEFT JOIN dataset_tables t ON t.environment_id=d.environment_id AND t.workspace_id=d.workspace_id AND t.dataset_id=d.dataset_id
    WHERE d.environment_id=? GROUP BY d.environment_id,d.workspace_id,d.dataset_id ORDER BY table_count DESC,d.workspace_name,d.dataset_name`).all(environmentId)
  return { datasets }
}

export function loadDatasourceRows(environmentId: string) {
  return db.prepare('SELECT * FROM dataset_datasources WHERE environment_id=? ORDER BY datasource_type,primary_value').all(environmentId) as Array<Record<string, unknown>>
}

export function saveCatalogState(environmentId: string, key: string, value: unknown) {
  db.prepare(`INSERT INTO catalog_state VALUES (?,?,?,?) ON CONFLICT(environment_id,cache_key)
    DO UPDATE SET value_json=excluded.value_json,updated_at=excluded.updated_at`).run(environmentId, key, JSON.stringify(value), new Date().toISOString())
}

export function loadCatalogState<T>(environmentId: string, key: string): { value: T; updatedAt: string } | null {
  const row = db.prepare('SELECT value_json,updated_at FROM catalog_state WHERE environment_id=? AND cache_key=?').get(environmentId, key) as {value_json:string;updated_at:string}|undefined
  if (!row) return null
  if (key === 'datasource-index' && !isFresh(row.updated_at, DATASOURCE_INDEX_TTL_MS)) return null
  return { value: JSON.parse(row.value_json) as T, updatedAt: row.updated_at }
}

// ---------------------------------------------------------------------------
// 数据集文档化：数据集备注 + 字段级备注
// ---------------------------------------------------------------------------

export function saveDatasetNote(input: { environmentId: string; workspaceId: string; datasetId: string; note: string }) {
  db.prepare(`INSERT INTO dataset_notes VALUES (@environmentId,@workspaceId,@datasetId,@note,@updatedAt)
    ON CONFLICT(environment_id,workspace_id,dataset_id) DO UPDATE SET note=excluded.note,updated_at=excluded.updatedAt`)
    .run({ ...input, updatedAt: new Date().toISOString() })
}

export function loadDatasetNote(environmentId: string, workspaceId: string, datasetId: string): string {
  const row = db.prepare('SELECT note FROM dataset_notes WHERE environment_id=? AND workspace_id=? AND dataset_id=?')
    .get(environmentId, workspaceId, datasetId) as { note?: string } | undefined
  return row?.note ?? ''
}

export function saveColumnNote(input: { environmentId: string; workspaceId: string; datasetId: string; tableName: string; columnName: string; note: string }) {
  if (input.note.trim() === '') {
    db.prepare('DELETE FROM column_notes WHERE environment_id=? AND workspace_id=? AND dataset_id=? AND table_name=? AND column_name=?')
      .run(input.environmentId, input.workspaceId, input.datasetId, input.tableName, input.columnName)
    return
  }
  db.prepare(`INSERT INTO column_notes VALUES (@environmentId,@workspaceId,@datasetId,@tableName,@columnName,@note,@updatedAt)
    ON CONFLICT(environment_id,workspace_id,dataset_id,table_name,column_name) DO UPDATE SET note=excluded.note,updated_at=excluded.updatedAt`)
    .run({ ...input, updatedAt: new Date().toISOString() })
}

export function loadColumnNotes(environmentId: string, workspaceId: string, datasetId: string): Record<string, string> {
  const rows = db.prepare('SELECT table_name,column_name,note FROM column_notes WHERE environment_id=? AND workspace_id=? AND dataset_id=?')
    .all(environmentId, workspaceId, datasetId) as Array<{ table_name: string; column_name: string; note: string }>
  const map: Record<string, string> = {}
  for (const r of rows) map[`${r.table_name}.${r.column_name}`] = r.note
  return map
}

/** 已文档化数据集 ID 集合（有数据集备注或任意字段备注） */
export function loadDocumentedDatasetIds(environmentId: string): Set<string> {
  const ids = new Set<string>()
  const notes = db.prepare('SELECT dataset_id FROM dataset_notes WHERE environment_id=? AND note != \'\'').all(environmentId) as Array<{ dataset_id: string }>
  for (const r of notes) ids.add(r.dataset_id)
  const cols = db.prepare('SELECT DISTINCT dataset_id FROM column_notes WHERE environment_id=?').all(environmentId) as Array<{ dataset_id: string }>
  for (const r of cols) ids.add(r.dataset_id)
  return ids
}

/** 导出数据集文档（Markdown 格式） */
export function exportDatasetDocMarkdown(environmentId: string, workspaceId: string, datasetId: string, datasetName: string, schema: { tables: Array<{ name: string; columns?: Array<{ name: string; dataType?: string }>; measures?: Array<{ name: string; expression?: string }> }> }): string {
  const note = loadDatasetNote(environmentId, workspaceId, datasetId)
  const colNotes = loadColumnNotes(environmentId, workspaceId, datasetId)
  const lines: string[] = []
  lines.push(`# ${datasetName}`)
  lines.push('')
  if (note) {
    lines.push(note)
    lines.push('')
  }
  for (const table of schema.tables) {
    lines.push(`## ${table.name}`)
    lines.push('')
    if ((table.columns ?? []).length > 0) {
      lines.push('| 字段 | 类型 | 说明 |')
      lines.push('| --- | --- | --- |')
      for (const col of table.columns ?? []) {
        const key = `${table.name}.${col.name}`
        lines.push(`| ${col.name} | ${col.dataType ?? ''} | ${colNotes[key] ?? ''} |`)
      }
      lines.push('')
    }
    if ((table.measures ?? []).length > 0) {
      lines.push('### 度量值')
      lines.push('')
      for (const m of table.measures ?? []) {
        lines.push(`- **${m.name}**: \`${m.expression ?? ''}\``)
      }
      lines.push('')
    }
  }
  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// 业务门户：报表分组管理
// ---------------------------------------------------------------------------

export interface PortalGroup {
  groupId: string
  name: string
  sortOrder: number
  items: { reportId: string; workspaceId: string }[]
}

function genId(): string {
  return `g-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

export function listPortalGroups(environmentId: string): PortalGroup[] {
  const groups = db.prepare('SELECT group_id,name,sort_order FROM portal_groups WHERE environment_id=? ORDER BY sort_order,name')
    .all(environmentId) as Array<{ group_id: string; name: string; sort_order: number }>
  const items = db.prepare('SELECT group_id,report_id,workspace_id FROM portal_group_items WHERE environment_id=? ORDER BY sort_order')
    .all(environmentId) as Array<{ group_id: string; report_id: string; workspace_id: string }>
  return groups.map((g) => ({
    groupId: g.group_id,
    name: g.name,
    sortOrder: g.sort_order,
    items: items.filter((i) => i.group_id === g.group_id).map((i) => ({ reportId: i.report_id, workspaceId: i.workspace_id })),
  }))
}

export function createPortalGroup(environmentId: string, name: string): PortalGroup {
  const id = genId()
  const max = (db.prepare('SELECT COALESCE(MAX(sort_order),-1) AS m FROM portal_groups WHERE environment_id=?').get(environmentId) as { m: number }).m
  db.prepare('INSERT INTO portal_groups VALUES (?,?,?,?,?)').run(environmentId, id, name, max + 1, new Date().toISOString())
  return { groupId: id, name, sortOrder: max + 1, items: [] }
}

export function renamePortalGroup(environmentId: string, groupId: string, name: string): void {
  db.prepare('UPDATE portal_groups SET name=?, updated_at=? WHERE environment_id=? AND group_id=?')
    .run(name, new Date().toISOString(), environmentId, groupId)
}

export function deletePortalGroup(environmentId: string, groupId: string): void {
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM portal_group_items WHERE environment_id=? AND group_id=?').run(environmentId, groupId)
    db.prepare('DELETE FROM portal_groups WHERE environment_id=? AND group_id=?').run(environmentId, groupId)
  })
  tx()
}

export function setPortalGroupItems(environmentId: string, groupId: string, items: { reportId: string; workspaceId: string }[]): void {
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM portal_group_items WHERE environment_id=? AND group_id=?').run(environmentId, groupId)
    const insert = db.prepare('INSERT INTO portal_group_items VALUES (?,?,?,?,?,?)')
    items.forEach((item, idx) => insert.run(environmentId, groupId, item.reportId, item.workspaceId, idx, new Date().toISOString()))
  })
  tx()
}

/** 未分组报表：加入分组时用 */
export function reportInGroup(environmentId: string, reportId: string, workspaceId: string): string | undefined {
  const row = db.prepare('SELECT group_id FROM portal_group_items WHERE environment_id=? AND report_id=? AND workspace_id=? LIMIT 1')
    .get(environmentId, reportId, workspaceId) as { group_id?: string } | undefined
  return row?.group_id
}

// ---------------------------------------------------------------------------
// 嵌入埋点：报表预览会话中的用户交互事件
// ---------------------------------------------------------------------------

export interface EmbedEventInput {
  environmentId: string
  sessionId: string
  reportId: string
  workspaceId: string
  reportName?: string
  eventType: string
  pageName?: string
  details?: Record<string, unknown>
}

export function saveEmbedEvents(events: EmbedEventInput[]): number {
  const insert = db.prepare('INSERT INTO embed_events (environment_id,session_id,report_id,workspace_id,report_name,event_type,page_name,details_json,created_at) VALUES (?,?,?,?,?,?,?,?,?)')
  const tx = db.transaction(() => {
    for (const e of events) {
      insert.run(
        e.environmentId,
        e.sessionId.slice(0, 64),
        e.reportId,
        e.workspaceId,
        e.reportName?.slice(0, 200) ?? null,
        e.eventType.slice(0, 40),
        e.pageName?.slice(0, 120) ?? null,
        e.details ? JSON.stringify(e.details).slice(0, 2000) : null,
        new Date().toISOString(),
      )
    }
  })
  tx()
  return events.length
}

export interface EmbedUsageStats {
  totalEvents: number
  sessionCount: number
  reportViews: Array<{ reportId: string; workspaceId: string; name: string; views: number; sessions: number }>
  pageViews: Array<{ reportId: string; pageName: string; views: number }>
  interactions: Array<{ eventType: string; count: number }>
  recentSessions: Array<{ sessionId: string; reportId: string; name: string; startedAt: string; events: number }>
}

export function loadEmbedUsage(environmentId: string, days: number): EmbedUsageStats {
  const cutoff = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString()
  const total = (db.prepare('SELECT COUNT(*) AS c FROM embed_events WHERE environment_id=? AND created_at>=?').get(environmentId, cutoff) as { c: number }).c
  const sessions = (db.prepare('SELECT COUNT(DISTINCT session_id) AS c FROM embed_events WHERE environment_id=? AND created_at>=?').get(environmentId, cutoff) as { c: number }).c

  const reportRows = db.prepare(`SELECT e.report_id, e.workspace_id, COUNT(*) AS views, COUNT(DISTINCT e.session_id) AS sessions
    FROM embed_events e WHERE e.environment_id=? AND e.created_at>=? AND e.event_type='reportLoaded'
    GROUP BY e.report_id, e.workspace_id ORDER BY views DESC LIMIT 20`).all(environmentId, cutoff) as Array<{ report_id: string; workspace_id: string; views: number; sessions: number }>
  const nameRows = db.prepare('SELECT DISTINCT report_id, report_name FROM embed_events WHERE environment_id=? AND report_name IS NOT NULL').all(environmentId) as Array<{ report_id: string; report_name: string | null }>
  const nameMap = new Map<string, string>()
  for (const n of nameRows) if (n.report_name) nameMap.set(n.report_id, n.report_name)
  const reportViews = reportRows.map((r) => ({ reportId: r.report_id, workspaceId: r.workspace_id, name: nameMap.get(r.report_id) ?? r.report_id.slice(0, 8), views: r.views, sessions: r.sessions }))

  const pageRows = db.prepare(`SELECT report_id, page_name, COUNT(*) AS views FROM embed_events
    WHERE environment_id=? AND created_at>=? AND event_type IN ('pageChanged','reportLoaded') AND page_name IS NOT NULL
    GROUP BY report_id, page_name ORDER BY views DESC LIMIT 20`).all(environmentId, cutoff) as Array<{ report_id: string; page_name: string; views: number }>
  const pageViews = pageRows.map((r) => ({ reportId: r.report_id, pageName: r.page_name, views: r.views }))

  const interactionRows = db.prepare(`SELECT event_type, COUNT(*) AS count FROM embed_events
    WHERE environment_id=? AND created_at>=? AND event_type != 'reportLoaded'
    GROUP BY event_type ORDER BY count DESC`).all(environmentId, cutoff) as Array<{ event_type: string; count: number }>
  const interactions = interactionRows.map((r) => ({ eventType: r.event_type, count: r.count }))

  const sessionRows = db.prepare(`SELECT session_id, report_id, MIN(created_at) AS started_at, COUNT(*) AS events
    FROM embed_events WHERE environment_id=? AND created_at>=?
    GROUP BY session_id, report_id ORDER BY started_at DESC LIMIT 20`).all(environmentId, cutoff) as Array<{ session_id: string; report_id: string; started_at: string; events: number }>
  const recentSessions = sessionRows.map((r) => ({ sessionId: r.session_id, reportId: r.report_id, name: nameMap.get(r.report_id) ?? r.report_id.slice(0, 8), startedAt: r.started_at, events: r.events }))

  return { totalEvents: total, sessionCount: sessions, reportViews, pageViews, interactions, recentSessions }
}
