import { NextRequest, NextResponse } from 'next/server'
import { fail } from '@/lib/api'
import { getTenantSnapshot, invalidateSchemaCache, scanWorkspacesSchemas } from '@/lib/pbi'
import { saveDatasetCatalog, saveDatasetTables } from '@/lib/catalog-store'
import { getActiveEnvironment } from '@/lib/config'

export const dynamic = 'force-dynamic'

/** 统一数据模型目录：工作区/数据集/表/列/度量值/M 表达式。扫描失败的工作区会保留在 errors 中。 */
export async function GET(req: NextRequest) {
  try {
    const force = req.nextUrl.searchParams.get('force') === '1'
    if (force) invalidateSchemaCache()
    const snapshot = await getTenantSnapshot(force)
    saveDatasetCatalog(getActiveEnvironment()?.id ?? '', snapshot.datasets, snapshot.fetchedAt)
    const schemas = new Map<string, Map<string, import('@/lib/types').DatasetSchema>>()
    const errors: { workspaceIds: string[]; workspaceNames: string[]; message: string }[] = []
    for (let offset = 0; offset < snapshot.workspaces.length; offset += 100) {
      const batch = snapshot.workspaces.slice(offset, offset + 100)
      try {
        const scanned = await scanWorkspacesSchemas(batch.map((workspace) => workspace.id))
        for (const [workspaceId, datasets] of scanned) schemas.set(workspaceId, datasets)
      } catch (e) {
        errors.push({
          workspaceIds: batch.map((workspace) => workspace.id),
          workspaceNames: batch.map((workspace) => workspace.name),
          message: e instanceof Error ? e.message : String(e),
        })
      }
    }

    const environmentId = getActiveEnvironment()?.id ?? ''
    const models = snapshot.datasets.map((dataset) => {
      const schema = schemas.get(dataset.workspaceId)?.get(dataset.id) ?? null
      if (schema?.tables.length) {
        saveDatasetTables({
          environmentId,
          workspaceId: dataset.workspaceId,
          datasetId: dataset.id,
          workspaceName: dataset.workspaceName,
          datasetName: dataset.name,
          source: 'schema',
          tables: schema.tables.map((table) => ({ name: table.name, isHidden: table.isHidden })),
          fetchedAt: new Date().toISOString(),
        })
      }
      return { ...dataset, schema }
    })
    return NextResponse.json({ mode: snapshot.mode, fetchedAt: snapshot.fetchedAt, schemaFetchedAt: new Date().toISOString(), models, errors })
  } catch (e) {
    return fail(e)
  }
}
