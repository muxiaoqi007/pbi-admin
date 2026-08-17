import 'server-only'
import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import type { PbiDatasource, PbiTable } from './types'

const dataDir = path.join(process.cwd(), 'data')
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
`)

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
  if (!rows.length) return null
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
  return row ? { value: JSON.parse(row.value_json) as T, updatedAt: row.updated_at } : null
}
