# pbi-admin — Power BI 管理员运维平台

自托管的 Power BI 租户运维工具，**同时适配国际版（Global）与世纪互联版（21Vianet）**，以服务主体或账号密码身份调用 Power BI 管理 REST API。

## 功能

| 功能 | 说明 |
| --- | --- |
| 双云适配 | 国际版 / 世纪互联一键切换，认证地址、API 端点、Scope 全部自动适配 |
| 多环境管理 | 保存多套环境（多租户/多云混用），顶栏快速切换，缓存按环境隔离 |
| 总览 | 工作区 / 报表 / 数据集 / 成员统计，刷新失败巡检（全租户扫描可刷新数据集），全租户刷新状态 |
| 工作区 | 全部工作区列表与详情：成员及角色、报表、数据集（含操作入口） |
| 报表 | 全租户报表浏览（跨工作区搜索），查看报表用户、报表页面、绑定的数据源、直达 Power BI 链接 |
| 数据集 | 全租户数据集浏览，查看数据源（SQL/文件/文件夹/Web 等类型自动解析）、数据集权限用户、**反查使用该数据集的前端报表**（含跨工作区引用）、完整结构（表/列/度量值）、刷新记录、刷新计划、立即刷新、批量刷新 |
| 数据源视角 | 按「类型 + 服务器/路径/网址 + 数据库」聚合数据源并**反查所有关联数据集**（影响分析），支持类型筛选、CSV 导出 |
| 刷新 | 触发刷新：全部（经典）/ 全部（增强）/ 选表三种方式；处理类型支持 full、automatic、dataOnly、calculate、clearValues、defragment；可配提交模式、并行度、重试、忽略增量刷新策略、增量有效日期；数据集页支持**多选批量刷新**（并发 3 防限流） |
| 列表导出 | 工作区 / 报表 / 数据集列表一键导出 CSV（带 BOM，Excel 直接打开不乱码） |
| 访问保护 | 可选：设置 `PBI_ADMIN_PASSWORD` 后全部页面与 API 需密码登录 |

租户数据快照在服务端缓存 5 分钟，避免重复扫描。

## 管理模式与成员模式（自动选择）

工具会先尝试**管理模式**（管理 API，全租户可见），不可用时自动降级为**成员模式**（普通 API，仅服务主体已加入的工作区）：

| | 管理模式 | 成员模式 |
| --- | --- | --- |
| 触发条件 | 管理 API 可用（取决于云、应用程序权限和租户设置） | 管理 API 返回 401/403/404；普通工作区 API 仍可用 |
| 数据范围 | 租户内全部工作区 | 服务主体已加入的工作区 |
| 工作区/成员/报表/数据集/数据源/刷新记录/触发刷新 | ✓ | ✓ |
| 报表级单独授权用户 | ✓ | ✗（世纪互联无此接口） |
| 全租户刷新状态总览 | ✓ | ✗ |

当前模式显示在：设置页测试连接结果、总览页顶部横幅。

## 快速开始

```bash
npm install
cp .env.example .env.local   # 可选，也可启动后在「设置」页填写
npm run dev                  # 打开 http://localhost:3000
```

首次使用请进入「设置」页：新建一个租户环境（云环境 + 认证方式 + 凭据）→ 点「保存并测试连接」。

## 多租户环境管理

- 「设置」页左侧环境列表：新建、编辑、删除、切换当前环境
- 顶栏下拉快速切换器（多于 1 个环境时显示）
- 每个环境独立的：云类型、认证方式、凭据、端点覆盖
- 切换环境后令牌与所有数据缓存自动按环境隔离失效

### 两种认证方式

| | 服务主体（密钥） | 账号密码（ROPC） |
| --- | --- | --- |
| 适用场景 | 无人值守运维、自动化 | 需要以管理员用户身份调用 Admin API |
| 凭据 | 客户端 ID + 密钥 | 客户端 ID + 用户名(UPN) + 密码 |
| OAuth 流程 | `client_credentials` | `password`（ROPC） |
| 令牌类型 | 应用程序令牌（roles 声明） | 委托用户令牌（scp 声明） |

> ROPC 需要应用注册为「移动和桌面应用」类型（公共客户端）。若应用注册为 Web 类型，Azure 会要求带 `client_secret`，此时可在环境配置中同时填写密钥。

## 应用注册步骤

1. **注册应用**：国际版 <https://portal.azure.com>，世纪互联 <https://portal.azure.cn>。路径：Entra ID → 应用注册 → 新注册。

2. **创建客户端密钥**：应用 → 证书和密码 → 新客户端密码。

3. **Power BI 租户设置**（关键）：Entra 门户建安全组 → 把服务主体加入 → Power BI 管理门户 → 租户设置 → 开发人员设置 →「允许服务主体使用 Fabric API」→ 启用 → 作用域选安全组。生效最长 15 分钟。

4. **触发刷新的前置条件**：服务主体必须是目标工作区成员（Contributor 即可）。

## 双云端点对照

| | 国际版 | 世纪互联 |
| --- | --- | --- |
| 认证 Authority | `https://login.microsoftonline.com` | `https://login.chinacloudapi.cn` |
| 认证端点 | `/{tenant}/oauth2/v2.0/token` | 同左 |
| Token Resource | `https://analysis.windows.net/powerbi/api` | `https://analysis.chinacloudapi.cn/powerbi/api` |
| API 基地址 | `https://api.powerbi.com/v1.0/myorg` | `https://api.powerbi.cn/v1.0/myorg` |

## 使用的 Power BI REST API

### 认证

| 端点 | 方法 | 说明 |
| --- | --- | --- |
| `{authority}/{tenant}/oauth2/v2.0/token` | POST | 获取访问令牌（client_credentials 或 ROPC） |

### 管理模式（Admin API，需租户设置允许服务主体）

| Power BI REST API 端点 | 方法 | 工具内用途 |
| --- | --- | --- |
| `/admin/groups?$expand=users,reports,datasets` | GET | 全租户快照：工作区 + 成员 + 报表 + 数据集（分页 $top/$skip） |
| `/admin/reports/{id}/users` | GET | 报表级单独授权用户 |
| `/admin/datasets/{id}/datasources` | GET | 数据集数据源（管理视角） |
| `/admin/groups/{wid}/datasets/{did}/refreshes` | GET | 数据集刷新记录（管理视角） |
| `/admin/refreshables` | GET | 全租户可刷新项及最近刷新状态 |
| `/admin/workspaces/getInfo` | POST | 工作区 Schema 扫描（提交→轮询 scanStatus→取 scanResult） |
| `/admin/workspaces/scanStatus/{id}` | GET | 扫描状态轮询 |
| `/admin/workspaces/scanResult/{id}` | GET | 扫描结果（表/列/度量值/分区/M 代码） |
| `/admin/groups/{wid}/users` | POST | 把服务主体加入工作区 |

### 成员模式（普通 API，服务主体在工作区内）

| Power BI REST API 端点 | 方法 | 工具内用途 |
| --- | --- | --- |
| `/groups?$top=5000` | GET | 服务主体可见的工作区列表 |
| `/groups/{wid}/datasets` | GET | 工作区数据集 |
| `/groups/{wid}/reports` | GET | 工作区报表 |
| `/groups/{wid}/users` | GET | 工作区成员 |
| `/groups/{wid}/datasets/{did}/datasources` | GET | 数据集数据源 |
| `/groups/{wid}/datasets/{did}/refreshes` | GET | 数据集刷新记录 |
| `/groups/{wid}/datasets/{did}/refreshSchedule` | GET | 数据集定时刷新计划 |
| `/groups/{wid}/datasets/{did}/users` | GET | 数据集权限用户 |
| `/groups/{wid}/datasets/{did}/tables` | GET | 数据集表清单（仅推送数据集有效） |
| `/groups/{wid}/reports/{rid}/pages` | GET | 报表页面清单 |
| `/groups/{wid}/datasets/{did}/executeDaxQueries` | POST | DAX 目录查询（表/列/度量值结构，Arrow IPC 格式） |

### 刷新相关

| Power BI REST API 端点 | 方法 | 工具内用途 |
| --- | --- | --- |
| `/groups/{wid}/datasets/{did}/refreshes` | POST | 触发刷新（经典全量 / 增强全量 / 选表） |

**刷新请求体**：
- 经典全部刷新：`{ "notifyOption": "NoNotification" }`
- 增强刷新/选表：`{ "type": "full", "commitMode": "transactional", "maxParallelism": 1, "retryCount": 0, "notifyOption": "NoNotification", "objects": [{ "table": "表名" }] }`
- 可选：`"applyRefreshPolicy": false`（忽略增量策略）、`"effectiveDate": "2026-01-01T00:00:00Z"`

### DAX 目录查询（executeDaxQueries）

通过 `INFO.VIEW` 系列 DAX 视图获取数据集结构，无需管理 API 权限：

| DAX 查询 | 用途 |
| --- | --- |
| `EVALUATE TOPN(500, INFO.VIEW.TABLES())` | 表清单（表名、是否隐藏） |
| `EVALUATE TOPN(5000, INFO.VIEW.COLUMNS())` | 列清单（表名、列名、数据类型） |
| `EVALUATE TOPN(2000, INFO.VIEW.MEASURES())` | 度量值（表名、度量值名、DAX 表达式） |

> 注意：世纪互联的 executeDaxQueries 只允许一次一个查询，工具分三次并发执行。返回格式为 Apache Arrow IPC，服务端解析后按 `[Name]`、`[Table]`、`[DataType]` 等方括号字段名取值。

## 本地 SQLite 目录数据库

工具使用 `better-sqlite3` 将数据集元数据、表清单、数据源信息持久化到 `data/catalog.sqlite`，按环境隔离。

### 表结构

```sql
-- 数据集主表（环境 + 工作区 + 数据集 联合主键）
CREATE TABLE datasets (
  environment_id TEXT NOT NULL,
  workspace_id   TEXT NOT NULL,
  dataset_id     TEXT NOT NULL,
  workspace_name TEXT,
  dataset_name   TEXT,
  updated_at     TEXT NOT NULL,
  PRIMARY KEY (environment_id, workspace_id, dataset_id)
);

-- 数据集表清单（表名缓存，来源标记：rest/dax/schema/legacy）
CREATE TABLE dataset_tables (
  environment_id TEXT NOT NULL,
  workspace_id   TEXT NOT NULL,
  dataset_id     TEXT NOT NULL,
  table_name     TEXT NOT NULL,
  is_hidden      INTEGER,        -- NULL=未知, 0=可见, 1=隐藏
  source         TEXT NOT NULL,  -- rest | dax | schema | legacy
  updated_at     TEXT NOT NULL,
  PRIMARY KEY (environment_id, workspace_id, dataset_id, table_name)
);

-- 数据集数据源（按连接聚合）
CREATE TABLE dataset_datasources (
  environment_id  TEXT NOT NULL,
  workspace_id    TEXT NOT NULL,
  dataset_id      TEXT NOT NULL,
  datasource_key  TEXT NOT NULL,   -- type|primary|secondary 复合键
  datasource_type TEXT NOT NULL,   -- Sql | File | Web | Folder | AnalysisServices ...
  primary_value   TEXT NOT NULL,   -- 服务器/路径/网址
  secondary_value TEXT,            -- 数据库/连接器
  gateway_id      TEXT,
  raw_json        TEXT,            -- 完整原始 JSON
  updated_at      TEXT NOT NULL,
  PRIMARY KEY (environment_id, workspace_id, dataset_id, datasource_key)
);

-- 目录状态缓存（数据源视角索引等）
CREATE TABLE catalog_state (
  environment_id TEXT NOT NULL,
  cache_key      TEXT NOT NULL,
  value_json     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  PRIMARY KEY (environment_id, cache_key)
);

-- 索引
CREATE INDEX idx_tables_dataset ON dataset_tables (environment_id, dataset_id);
CREATE INDEX idx_sources_env   ON dataset_datasources (environment_id);
```

### 缓存策略

| 数据 | 缓存位置 | TTL | 刷新方式 |
| --- | --- | --- | --- |
| 访问令牌 | 内存 | 1 小时（提前 60 秒刷新） | 401/403 自动刷新 |
| 全租户快照 | 内存 | 5 分钟 | 强制刷新按钮 |
| 数据源视角 | SQLite | 10 分钟 | 强制重扫按钮 |
| 数据集表清单 | SQLite | 永久（按环境+数据集隔离） | 重新读取/清除缓存 |
| 数据集 Schema | 内存 | 30 分钟 | 自动过期 |
| 刷新失败巡检 | 内存 | 10 分钟 | 重新巡检按钮 |

所有缓存按环境 ID 隔离，切换环境后自动失效。

## 常见错误

| 现象 | 原因与处理 |
| --- | --- |
| 404 "No HTTP resource was found .../admin/workspaces" | 世纪互联不支持该新路由，工具已统一改用 `/admin/groups` |
| 401/403（调用 `/admin/*`） | 租户设置未开启「允许服务主体使用 Fabric API」，或服务主体不在允许的安全组中 |
| 401 PowerBINotAuthorizedException（报表页面） | 服务主体不在报表所在工作区内 → 加入工作区或使用 ROPC 认证 |
| 401（表清单/结构） | 服务主体缺 Build 权限 → 在数据集「使用权限」中给服务主体授权 |
| 获取令牌失败 AADSTS90002 | 云环境选错了，或租户 ID 填错 |
| 获取令牌失败 AADSTS7000218 | ROPC 模式下 Web 类型应用需带 client_secret，改为公共客户端或同时填写密钥 |
| 获取令牌失败 invalid_client | 客户端密钥错误或已过期 |

## 技术栈

Next.js 15（App Router）+ TypeScript + Ant Design 5 + SWR + better-sqlite3。所有 Power BI 调用由服务端 API Route 代理，凭据只存在于服务端（`data/config.json` + `data/catalog.sqlite`，均已 gitignore）。

### Docker 部署

```bash
docker build -t pbi-admin .
docker run -d -p 3000:3000 \
  -v pbi-admin-data:/app/data \
  -e PBI_ADMIN_PASSWORD=你的访问密码 \
  --name pbi-admin pbi-admin
```

也可通过环境变量预置连接（`PBI_CLOUD` / `PBI_TENANT_ID` / `PBI_CLIENT_ID` / `PBI_CLIENT_SECRET`），设置页的保存值优先。
