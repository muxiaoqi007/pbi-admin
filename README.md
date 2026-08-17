# pbi-admin — Power BI 管理员运维平台

自托管的 Power BI 租户运维工具，**同时适配国际版（Global）与世纪互联版（21Vianet）**，以服务主体身份调用 Power BI 管理 REST API。

## 功能

| 功能 | 说明 |
| --- | --- |
| 双云适配 | 国际版 / 世纪互联一键切换，认证地址、API 端点、Scope 全部自动适配 |
| 总览 | 工作区 / 报表 / 数据集 / 成员统计，全租户最近刷新状态（成功/失败/错误信息） |
| 工作区 | 全部工作区列表与详情：成员及角色、报表、数据集 |
| 报表 | 全租户报表浏览（跨工作区搜索），查看报表的用户、报表绑定的数据源、直达 Power BI 链接 |
| 数据集 | 全租户数据集浏览，查看数据源（SQL/文件/文件夹/Web 等类型自动解析）、**反查使用该数据集的前端报表**（含跨工作区引用）、刷新记录 |
| 数据源视角 | 按「类型 + 服务器/路径/网址 + 数据库」聚合数据源并**反查所有关联数据集**（影响分析），支持类型筛选、CSV 导出 |
| 刷新 | 触发刷新：全部（经典）/ 全部（增强）/ 选表三种方式；处理类型支持 full、automatic、dataOnly、calculate、clearValues、defragment；可配提交模式、并行度、重试、忽略增量刷新策略、增量有效日期；数据集页支持**多选批量刷新**（并发 3 防限流） |
| 列表导出 | 工作区 / 报表 / 数据集列表一键导出 CSV（带 BOM，Excel 直接打开不乱码） |
| 运维工具 | 把服务主体批量加入工作区（触发刷新的前置条件），一键全选未加入的工作区 |
| 访问保护 | 可选：设置 `PBI_ADMIN_PASSWORD` 后全部页面与 API 需密码登录 |

租户数据快照在服务端缓存 5 分钟，避免重复扫描。

## 管理模式与成员模式（自动选择）

工具会先尝试**管理模式**（管理 API，全租户可见），不可用时自动降级为**成员模式**（普通 API，仅服务主体已加入的工作区）：

| | 管理模式 | 成员模式 |
| --- | --- | --- |
| 触发条件 | 管理 API 可用（取决于当前云、应用程序权限和租户设置） | 管理 API 返回 401/403/404；普通工作区 API 仍可用时自动降级 |
| 数据范围 | 租户内全部工作区 | 服务主体已加入的工作区 |
| 工作区/成员/报表/数据集/数据源/刷新记录/触发刷新 | ✓ | ✓ |
| 报表级单独授权用户 | ✓ | ✗（世纪互联无此接口，页面会明确提示，可用工作区成员替代） |
| 全租户刷新状态总览、批量加入工作区 | ✓ | ✗（运维工具页会显示手动添加指引） |

当前模式和降级原因显示在：设置页测试连接结果、总览页顶部横幅。

## 快速开始

```bash
npm install
cp .env.example .env.local   # 可选，也可启动后在「设置」页填写
npm run dev                  # 打开 http://localhost:3000
```

首次使用请进入「设置」页：新建一个租户环境（云环境 + 租户 ID + 客户端 ID + 客户端密钥）→ 点「保存并测试连接」。测试通过后其余页面即可正常使用。

## 多租户环境管理

支持保存多套环境（多个租户 / 多种云混用），随时切换：

- 「设置」页左侧环境列表：新建、编辑、删除、切换当前环境
- 顶栏下拉快速切换器（多于 1 个环境时显示）
- 每个环境独立的：云类型（国际版/世纪互联）、认证方式、凭据、端点覆盖
- 切换环境后令牌与所有数据缓存（快照/数据源索引/Schema/巡检）自动按环境隔离失效
- 旧版单环境配置文件自动迁移为「默认环境」，无需手动处理

### 两种认证方式

| | 服务主体（密钥） | 账号密码（ROPC） |
| --- | --- | --- |
| 适用场景 | 无人值守运维、自动化 | 需要以管理员用户身份调用 Admin API（世纪互联管理 API 不支持服务主体时） |
| 凭据 | 客户端 ID + 密钥 | 客户端 ID + 用户名(UPN) + 密码 |
| 令牌类型 | 应用程序令牌（roles 声明） | 委托用户令牌（scp 声明） |
| 应用注册权限 | 应用程序权限（Application） | 委托权限（Delegated），且需开启「允许公共客户端流」 |

> ROPC（Resource Owner Password Credentials）流程需要应用注册中添加 Power BI Service 的**委托权限**（非应用程序权限），并在「身份验证」页开启「允许公共客户端流」。此流程在部分云环境可能受条件访问策略限制。

生产部署：`npm run build && npm start`，或使用 Docker（见下）。工具只应在受信任的内网环境运行（能接触租户全部元数据）；若内网内多人可访问，建议设置 `PBI_ADMIN_PASSWORD` 启用访问密码。

### Docker 部署

```bash
docker build -t pbi-admin .
# 连接配置在「设置」页填写，持久化到挂载的 data 卷
docker run -d -p 3000:3000 \
  -v pbi-admin-data:/app/data \
  -e PBI_ADMIN_PASSWORD=你的访问密码 \
  --name pbi-admin pbi-admin
```

也可通过环境变量预置 Power BI 连接（`PBI_CLOUD` / `PBI_TENANT_ID` / `PBI_CLIENT_ID` / `PBI_CLIENT_SECRET`），设置页的保存值优先。

## 应用注册步骤（管理员一次性操作）

1. **注册应用**（在对应云的门户操作，二者选一）：
   - 国际版：<https://portal.azure.com>
   - 世纪互联：<https://portal.azure.cn>

   路径：Microsoft Entra ID → 应用注册 → 新注册（账户类型选「仅此组织目录中的账户」）。

2. **创建客户端密钥**：应用 → 证书和密码 → 新客户端密码，复制「值」（只显示一次）。

3. **不要给服务主体添加 Power BI 的委托权限或需要管理员同意的应用程序权限**。本工具使用 `client_credentials`，Power BI Admin API 的授权由 Fabric/Power BI 管理门户的租户设置和安全组控制；错误地给应用注册添加 `Tenant.Read.All`、`Tenant.ReadWrite.All` 等角色，可能导致令牌带有 Power BI 应用角色而被 Admin API 返回 401。

   普通工作区 API 的访问范围仍由服务主体是否加入工作区决定。需要扫描全租户时，继续完成下一步的 Admin API 租户设置。

4. **Power BI 租户设置**（关键，缺了这步管理 API 全部 401/403）：
   1. 在 Entra 门户建一个**安全组**，把应用的服务主体加为组成员（Entra ID → 组 → 新建组「安全」类型 → 成员添加时切换到「服务主体」选择你的应用）。
   2. 以 Power BI 管理员身份打开 Power BI 服务 → 设置 ⚙ → 管理门户 → 租户设置 → 开发人员设置 →「**允许服务主体使用 Fabric API**」（世纪互联租户里叫「允许服务主体使用 Power BI API」）→ 启用 → 作用域选「特定安全组」→ 选择上面的安全组 → 保存。
   3. 租户设置生效最长可能需要 15 分钟，之后回到本工具「设置」页点「保存并测试连接」。

5. **触发刷新的前置条件**：Power BI 没有以管理员身份直接触发刷新的 API，服务主体必须是目标工作区成员。到本工具「**运维工具**」页，勾选工作区（支持一键全选未加入的）→ 选择角色（Contributor 即可触发刷新，Admin 权限最全）→ 执行。

## 双云端点对照（已内置，高级设置可覆盖）

| | 国际版 | 世纪互联 |
| --- | --- | --- |
| 认证 Authority | `https://login.microsoftonline.com` | `https://login.chinacloudapi.cn` |
| 认证端点 | `/{tenant}/oauth2/v2.0/token`（`scope=<resource>/.default`） | 同左 |
| Token Resource | `https://analysis.windows.net/powerbi/api` | `https://analysis.chinacloudapi.cn/powerbi/api` |
| API 基地址 | `https://api.powerbi.com/v1.0/myorg` | `https://api.powerbi.cn/v1.0/myorg` |

实现说明：

- 认证走 OAuth 2.0 client credentials（当前实现使用 `/oauth2/v2.0/token` + `scope=<resource>/.default`）。
- 管理 API 统一优先使用 /admin/groups 老路由；不同云环境的路由和权限以实际响应为准。若管理 API 返回 401/403/404 且普通 /groups 可用，工具会保留工作区数据并自动进入成员模式。
- 世纪互联若登录端点调整（如迁移到 `login.partner.microsoftonline.cn`），在「设置 → 高级设置」中覆盖 Authority 即可，无需改代码。

## 选表刷新（增强刷新）说明

- 走 `POST /groups/{wid}/datasets/{did}/refreshes` 的增强刷新请求（`objects` 指定表名）。
- 需要服务主体已加入该数据集所在工作区，否则无法读取表清单和触发刷新。
- 个别容量/数据集类型不支持增强刷新参数，Power BI 返回的错误会原样展示在页面上，此时可改用「全部刷新」。

## 常见错误

| 现象 | 原因与处理 |
| --- | --- |
| 404 "No HTTP resource was found .../admin/workspaces" | 世纪互联不支持该新路由，本工具已统一改用 `/admin/groups`（两云通用） |
| 401/403（调用 `/admin/*`） | 服务主体令牌或租户 Admin API 设置不匹配。先确认使用的是同一客户端凭据、同一 `/admin/...` URL；再检查管理门户中的「允许服务主体使用 Fabric/Power BI API」及安全组范围。不要仅凭普通 `/groups` 返回 200 判断租户 Admin API 已授权。 |
| 获取令牌失败 AADSTS90002（租户未找到） | 云环境选错了（国际版/世纪互联不匹配），或租户 ID 填错 |
| 获取令牌失败 invalid_client | 客户端密钥错误或已过期，重新创建密钥 |
| 403（触发刷新/表清单） | 服务主体未加入目标工作区 → 「运维工具」页批量加入 |

## 技术栈

Next.js 15（App Router）+ TypeScript + Ant Design 5 + SWR。所有 Power BI 调用由服务端 API Route 代理，客户端密钥只存在于服务端（`data/config.json` 或 `.env.local`，均已 gitignore）。
