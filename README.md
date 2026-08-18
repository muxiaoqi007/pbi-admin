# pbi-admin — Power BI 管理员运维平台

自托管的 Power BI 租户运维工具，**同时适配国际版（Global）与世纪互联版（21Vianet）**，以服务主体或账号密码身份调用 Power BI REST API。

> 运行时要求 **Node.js 22+**。项目使用的 `better-sqlite3` 当前版本不支持 Node 20。

## 功能

| 功能 | 说明 |
| --- | --- |
| 双云适配 | 国际版 / 世纪互联一键切换，认证地址、API 端点、Scope 自动适配 |
| 多环境管理 | 保存多套环境（多租户/多云混用），顶栏快速切换，缓存按环境隔离 |
| 总览 | 工作区 / 报表 / 数据集 / 成员统计，刷新失败巡检，全租户刷新状态 |
| 工作区 | 全部工作区列表与详情：成员及角色、报表、数据集（含操作入口） |
| 报表 | 全租户报表浏览（跨工作区搜索），查看报表用户、报表页面、绑定的数据源、直达 Power BI 链接 |
| 数据集 | 全租户数据集浏览，查看数据源、数据集权限用户、关联报表、完整结构（表/列/度量值）、刷新记录、刷新计划、立即刷新、批量刷新 |
| 数据源视角 | 按「类型 + 服务器/路径/网址 + 数据库」聚合数据源并反查所有关联数据集，支持筛选、CSV 导出 |
| 刷新 | 经典全量 / 增强全量 / 选表；支持处理类型、提交模式、并行度、重试、增量刷新策略与有效日期；批量刷新并发 3 |
| 列表导出 | 工作区 / 报表 / 数据集列表导出 CSV（UTF-8 BOM） |
| 访问保护 | 生产环境必须设置 `PBI_ADMIN_PASSWORD`；会话使用带过期时间的 HMAC 签名 HttpOnly Cookie |
| 凭据保护 | 设置 `PBI_CONFIG_ENCRYPTION_KEY` 后，`data/config.json` 中的 client secret / ROPC 密码使用 AES-256-GCM 加密 |

租户数据快照在服务端缓存 5 分钟，避免重复扫描。

## 管理模式与成员模式

工具优先尝试**管理模式**（Admin API，全租户可见），当 Admin API 返回 401/403/404 时自动降级为**成员模式**（普通 API，仅当前身份可见的工作区），并保留降级原因用于连接诊断。部分世纪互联租户是否支持具体 Admin API 取决于租户、权限和区域能力。

| | 管理模式 | 成员模式 |
| --- | --- | --- |
| 数据范围 | 租户内全部工作区 | 当前身份可访问的工作区 |
| 工作区/成员/报表/数据集/数据源/刷新记录/触发刷新 | ✓ | ✓ |
| 报表级单独授权用户 | ✓ | 部分环境不可用 |
| 全租户刷新状态总览 | ✓ | ✗ |

当前模式显示在设置页连接测试结果和总览页。

## 快速开始

```bash
# Node.js 22+
npm install
cp .env.example .env.local
npm run dev
```

开发环境可以不设置 `PBI_ADMIN_PASSWORD` 进行本机调试；**生产环境未配置该变量时服务会拒绝页面与 API 访问**。

首次使用进入「设置」页：新建租户环境（云环境 + 认证方式 + 凭据）→「保存并测试连接」。

如果生产环境需要通过设置页保存凭据，还必须设置：

```bash
PBI_CONFIG_ENCRYPTION_KEY=<独立高熵随机值>
```

建议通过 Docker Secret、Key Vault 或部署平台 Secret 注入，不要提交到仓库。已有明文 `data/config.json` 仍可读取；配置再次保存后会使用当前加密密钥写回密文。

## 多租户环境管理

- 设置页左侧环境列表：新建、编辑、删除、切换当前环境
- 顶栏下拉快速切换器（多于 1 个环境时显示）
- 每个环境独立的云类型、认证方式、凭据、端点覆盖
- 切换环境后内存缓存按环境隔离；SQLite 目录也以 `environment_id` 隔离

### 两种认证方式

| | 服务主体（密钥） | 账号密码（ROPC） |
| --- | --- | --- |
| 适用场景 | 无人值守运维、自动化，推荐 | 仅在确实需要用户委托身份时使用 |
| 凭据 | 客户端 ID + 密钥 | 客户端 ID + 用户名(UPN) + 密码 |
| OAuth 流程 | `client_credentials` | `password`（ROPC） |
| 令牌类型 | 应用程序令牌（roles） | 委托用户令牌（scp） |

> 当前 ROPC 实现是**公共客户端流程**，不会发送 `client_secret`。应用注册应启用「移动和桌面应用 / Allow public client flows」。ROPC 不适合 MFA、Conditional Access 等现代认证场景；长期无人值守运维优先使用服务主体。

ROPC 的 Scope 跟随当前云环境：

- Global：`https://analysis.windows.net/powerbi/api/.default`
- China：`https://analysis.chinacloudapi.cn/powerbi/api/.default`

## 应用注册步骤

1. 注册应用：国际版使用 Azure Portal，世纪互联使用 Azure China Portal。
2. 服务主体模式：创建客户端密钥。
3. Power BI/Fabric 租户设置：按组织策略允许服务主体访问所需 API，并把应用放入允许的安全组。
4. 普通工作区 API、刷新、DAX 查询等功能还要求调用身份对目标工作区/语义模型具备相应权限。

## 双云端点对照

| | 国际版 | 世纪互联 |
| --- | --- | --- |
| Authority | `https://login.microsoftonline.com` | `https://login.chinacloudapi.cn` |
| OAuth v2 token | `/{tenant}/oauth2/v2.0/token` | 同左 |
| Token Resource | `https://analysis.windows.net/powerbi/api` | `https://analysis.chinacloudapi.cn/powerbi/api` |
| API 基地址 | `https://api.powerbi.com/v1.0/myorg` | `https://api.powerbi.cn/v1.0/myorg` |

## 使用的 Power BI REST API

### 管理模式

| 端点 | 方法 | 用途 |
| --- | --- | --- |
| `/admin/groups?$expand=users,reports,datasets` | GET | 全租户快照 |
| `/admin/reports/{id}/users` | GET | 报表级授权用户 |
| `/admin/datasets/{id}/datasources` | GET | 数据源（管理视角） |
| `/admin/groups/{wid}/datasets/{did}/refreshes` | GET | 刷新记录（管理视角） |
| `/admin/refreshables` | GET | 全租户可刷新项 |
| `/admin/workspaces/getInfo` | POST | Schema 扫描 |
| `/admin/workspaces/scanStatus/{id}` | GET | 扫描状态 |
| `/admin/workspaces/scanResult/{id}` | GET | 扫描结果 |
| `/admin/groups/{wid}/users` | POST | 把服务主体加入工作区 |

### 成员模式

| 端点 | 方法 | 用途 |
| --- | --- | --- |
| `/groups?$top=5000` | GET | 可见工作区列表 |
| `/groups/{wid}/datasets` | GET | 工作区数据集 |
| `/groups/{wid}/reports` | GET | 工作区报表 |
| `/groups/{wid}/users` | GET | 工作区成员 |
| `/groups/{wid}/datasets/{did}/datasources` | GET | 数据集数据源 |
| `/groups/{wid}/datasets/{did}/refreshes` | GET | 数据集刷新记录 |
| `/groups/{wid}/datasets/{did}/refreshSchedule` | GET | 定时刷新计划 |
| `/groups/{wid}/datasets/{did}/users` | GET | 数据集权限用户 |
| `/groups/{wid}/datasets/{did}/tables` | GET | 推送数据集表清单 |
| `/groups/{wid}/reports/{rid}/pages` | GET | 报表页面 |
| `/groups/{wid}/datasets/{did}/executeDaxQueries` | POST | DAX 目录查询 |

### 刷新请求

经典全部刷新：

```json
{
  "notifyOption": "NoNotification"
}
```

增强刷新：

```json
{
  "type": "full",
  "commitMode": "transactional",
  "maxParallelism": 1,
  "retryCount": 0
}
```

选表增强刷新在增强请求体上增加：

```json
{
  "objects": [
    { "table": "Sales" }
  ]
}
```

增强刷新不会发送 `notifyOption`。可选字段还包括 `applyRefreshPolicy` 和 `effectiveDate`。

### DAX 目录查询

| DAX | 用途 |
| --- | --- |
| `EVALUATE TOPN(500, INFO.VIEW.TABLES())` | 表清单 |
| `EVALUATE TOPN(5000, INFO.VIEW.COLUMNS())` | 列清单 |
| `EVALUATE TOPN(2000, INFO.VIEW.MEASURES())` | 度量值 |

世纪互联的 `executeDaxQueries` 返回 Apache Arrow IPC 时，服务端负责解压并解析 `[Name]`、`[Table]`、`[DataType]` 等字段。

## 本地 SQLite 目录数据库

`better-sqlite3` 将数据集元数据、表清单和数据源信息持久化到 `data/catalog.sqlite`，主键均包含 `environment_id`。

核心表：

```sql
CREATE TABLE datasets (
  environment_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  dataset_id TEXT NOT NULL,
  workspace_name TEXT,
  dataset_name TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (environment_id, workspace_id, dataset_id)
);

CREATE TABLE dataset_tables (
  environment_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  dataset_id TEXT NOT NULL,
  table_name TEXT NOT NULL,
  is_hidden INTEGER,
  source TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (environment_id, workspace_id, dataset_id, table_name)
);

CREATE TABLE dataset_datasources (
  environment_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  dataset_id TEXT NOT NULL,
  datasource_key TEXT NOT NULL,
  datasource_type TEXT NOT NULL,
  primary_value TEXT NOT NULL,
  secondary_value TEXT,
  gateway_id TEXT,
  raw_json TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (environment_id, workspace_id, dataset_id, datasource_key)
);

CREATE TABLE catalog_state (
  environment_id TEXT NOT NULL,
  cache_key TEXT NOT NULL,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (environment_id, cache_key)
);
```

### 缓存策略

| 数据 | 缓存位置 | TTL |
| --- | --- | --- |
| 访问令牌 | 内存 | token 有效期前 60 秒刷新 |
| 全租户快照 | 内存 | 5 分钟 |
| 数据源视角 | SQLite | 10 分钟 |
| 数据集表清单 | SQLite | 30 分钟 |
| 数据集 Schema | 内存 | 30 分钟 |
| 刷新失败巡检 | 内存 | 10 分钟 |

## 常见错误

| 现象 | 原因与处理 |
| --- | --- |
| `AADSTS90002` | 云环境或 tenant 配置错误 |
| `AADSTS500011` | 常见于 Token Resource/云环境不匹配；确认 Global 与 China Resource 没混用 |
| `AADSTS7000218` | ROPC 应用不是公共客户端；当前实现不会发送 client secret |
| `invalid_client` | 服务主体 client secret 错误或过期 |
| 表清单/结构 401 | 调用身份缺少语义模型查询所需权限（常见为 Build） |
| 报表页面 401 | 调用身份没有目标工作区/报表读取权限 |
| Admin API 401/403/404 | 自动尝试成员模式；同时检查租户设置、安全组、应用权限、当前认证方式和区域接口能力 |
| 配置凭据解密失败 | `PBI_CONFIG_ENCRYPTION_KEY` 与保存配置时使用的值不一致 |

## 技术栈

Next.js 16.3（App Router）+ TypeScript + Ant Design 5 + SWR + better-sqlite3 + Apache Arrow。运行时统一为 Node.js 22+。

## Docker 部署

```bash
docker build -t pbi-admin .

docker run -d -p 3000:3000 \
  -v pbi-admin-data:/app/data \
  -e PBI_ADMIN_PASSWORD='替换为高强度管理密码' \
  -e PBI_CONFIG_ENCRYPTION_KEY='替换为独立高熵随机值' \
  --name pbi-admin \
  pbi-admin
```

如果完全使用环境变量预置 Power BI 连接（`PBI_CLOUD` / `PBI_TENANT_ID` / `PBI_CLIENT_ID` / `PBI_CLIENT_SECRET`），可以不从设置页持久化 Power BI 凭据，此时 `PBI_CONFIG_ENCRYPTION_KEY` 不是必需的。

## 工程检查

```bash
npm ci
npm audit --omit=dev --audit-level=high
npm run typecheck
npm run lint
npm run build
```

Pull Request 会通过 GitHub Actions 自动执行上述检查。
