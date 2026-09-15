# MC Notes

一套自托管的「数据库 + 逻辑模型 + 页面」一体化工具：先把 SQLite 表建好，再配置字段业务类型，最后让页面直接展示对应表的数据 —— 全程通过 Web 完成，不写一行后端代码。

![首页占位页](docs/screenshots/home-placeholder.png)

## 主要特性

- **首页（移动优先）**：底部 Tab 展示一级页面，点亮后上方露出二级子页面，左对齐、样式与一级菜单一致。
  ![二级菜单展开](docs/screenshots/home-secondary-open.png)
- **运行时数据**：每个关联了逻辑模型的页面，自动获得增删改查表格、筛选、分页、上传字段。
  ![子页面运行时](docs/screenshots/home-runtime.png)
- **数据库管理**：左侧表列表，右侧实时 CRUD；新建表后，「编辑表」对话框里同时配置物理结构（增删列）和逻辑模型（字段别名、业务类型、列表/可搜索/可编辑/必填），一次保存。
  ![数据库表](docs/screenshots/dashboard-table.png)
- **页面配置**：两级页面、图标、排序、关联模型，一站式管理底部导航。
  ![页面配置](docs/screenshots/pages-list.png)
- **用户与角色**：超级管理员与普通用户分表管理；角色绑定功能权限；按角色决定可见的 Tab 与可执行的操作。
- **定时调度字段**：字段业务类型里提供「定时调度」，用户点选常用频率即可，落库存标准 cron 表达式；表格里点一下调度标签就能看接下来 5 次运行时间，既友好又不失机器可读。
- **设置中心**：上传根目录 / 受管 SQLite 路径热更新；修改密码；Swagger UI 跳转。
  ![设置中心](docs/screenshots/settings.png)
- **统计中心**：一组「卡片」的容器,每张卡片执行一条只读 SQL。卡片可以是**数字 / 表格**(单行单列→大数字;多行多列→紧凑表格)或**折线图**(X 轴列 + 多个 Y 轴数值列,图例可点击切换显隐,适合「最近 30 天天气变化」这类场景)。配置好的统计中心可以挂到底部导航的任意页面上,与逻辑模型共用同一套导航,SQL 服务端强制校验为只读 SELECT / WITH,强制 LIMIT 1000,自动忽略危险关键字与注释。
- **日志模块（外部写入）**：面向外部系统暴露 `POST /api/logs`（Bearer Token 或 Session Cookie），调用方主动推送日志；日志数据落到受管 SQLite 的 `logs` / `log_images` 表，并在首次启动时自动以「日志」页面 + `auto_logs` 逻辑模型挂到首页底部导航，复用通用的 ModelRuntime 做增删改查与筛选。**不会**自动记录本服务自身请求。

## 快速开始

环境：Go 1.25+、Node.js 20+、macOS/Linux。

### 一键本地开发循环

```bash
# 自动 npm install + vite build + go build + 启动(把二进制嵌入前端)
./restart.sh 8080

# 仅重建后端,假设 web/dist 已构建过
SKIP_WEB_BUILD=1 ./restart.sh 8080

# 停止
./stop.sh
```

### 打包成单二进制

```bash
./build.sh                          # 当前 OS/ARCH -> dist/mc
./build.sh linux amd64              # 交叉编译到 Linux x86_64
./build.sh darwin arm64             # Apple Silicon
./build.sh windows amd64            # Windows .exe
./build.sh all                      # 一次产出 5 个平台

SKIP_FRONTEND=1 ./build.sh linux amd64   # 跳过 npm,假定 web/dist 已就绪
```

产物 `dist/mc-<os>-<arch>[.exe]` 是单一自包含二进制:把前端 embed 进 Go 二进制,
没有外部资源。运行时会在当前目录创建 `data/`、`logs/`(由启动脚本) 等目录,
默认数据库 `data/app.db`、上传根目录 `data/uploads`、受管库 `data/managed.db`。
可通过 `-db` / `-upload-root` / `-managed-db` 改路径,传绝对路径。

部署到目标机器后:

```bash
./mc-linux-amd64 -host 0.0.0.0 -port 8080
```

启动后访问 `http://localhost:8080/`,默认账号 `test` / `test123`,首次登录会被强制要求修改密码。

也可以单独启动后端(仅开发用,不打包前端):

```bash
go run . -port 8080
```

前端开发模式(热更新,访问 `http://localhost:5173`):

```bash
cd web
npm install
npm run dev                         # /api 代理到 http://127.0.0.1:8080
```

## 技术栈

| 层 | 技术 |
| --- | --- |
| 后端 | Go 1.25、Gin、GORM + SQLite (`data/app.db` 系统库 / `data/managed.db` 受管库) |
| 前端 | React 19、TypeScript、Vite、Tailwind CSS v4、shadcn/ui (Radix)、lucide-react、Sonner |
| API | REST/JSON，启动后访问 `/swagger/` 查看 OpenAPI 文档 |

## 目录结构

```
.
├── main.go                       # 入口：装配 Gin 路由、初始化设置 + 受管 DB
├── web_assets.go                 //go:embed web/dist 前端 + 路由装配
├── handlers/                     # HTTP 处理器
│   ├── auth.go                   # 登录 / 登出 / 修改密码
│   ├── pages.go                  # 页面配置 CRUD
│   ├── logicmodels.go            # 逻辑模型 CRUD + 自动生成模型
│   ├── runtime.go                # /api/runtime/:slug 自动 CRUD
│   ├── cronjobs.go               # /api/cronjobs/* 系统级定时任务
│   ├── cron_preview.go           # /api/cron/next-runs 表达式 → 运行时间
│   ├── logs.go                   # /api/logs* 外部日志读写（受管库）
│   ├── tables.go                 # 受管库的表 / 列 / 行 CRUD
│   ├── schema.go                 # 表结构查询
│   ├── dbfile.go                 # 受管库状态（大小、表数量）
│   ├── upload.go                 # 文件上传 / 列表 / 删除
│   ├── settings.go               # 设置中心读写
│   └── swagger.go                # /swagger/* 文档
├── models/                       # 系统库 GORM 模型
├── logicmodels/                  # 逻辑模型存储 + 自动生成
├── pages/                        # 页面配置存储
├── dashboards/                   # 统计中心:仪表盘容器 + 卡片 + SQL 安全校验
├── logentries/                   # 日志条目(logs/log_images)存储 + 自动迁移
├── seed/                         # 首次启动时把默认页面/模型写入受管库
├── settings/                     # 设置 KV 存储
├── datadb/                       # 受管 SQLite 管理（动态加载 / 切换）
├── db/                           # 系统 SQLite 初始化、默认账号
├── web/                          # 前端工程
│   ├── src/
│   │   ├── App.tsx               # 顶层路由（tabs）
│   │   ├── components/
│   │   │   ├── AppShell.tsx      # 顶部布局 + Tab 栏
│   │   │   ├── LoginForm.tsx
│   │   │   ├── ChangePasswordForm.tsx
│   │   │   ├── Settings.tsx      # 设置中心
│   │   │   ├── Files.tsx         # 文件上传管理
│   │   │   ├── pages/
│   │   │   │   ├── HomeView.tsx       # 首页（一级 + 二级菜单、运行时）
│   │   │   │   ├── BottomNav.tsx      # 一级菜单
│   │   │   │   └── PagesList.tsx      # 页面配置列表
│   │   │   ├── dashboards/            # 统计中心:卡片列表 / 编辑器 / 折线图 / SQL 预览
│   │   │   │   ├── DashboardsList.tsx     # 统计中心容器列表
│   │   │   │   ├── DashboardEditor.tsx    # 单个 dashboard 的卡片编辑 + 实时预览
│   │   │   │   ├── CardEditorDialog.tsx   # 单张卡片的 SQL + 类型 + 渲染配置
│   │   │   │   ├── DashboardView.tsx      # 运行时聚合页:并发执行卡片 SQL,按 kind 渲染
│   │   │   │   └── LineChart.tsx          # 纯 SVG 折线图,图例点击切换显隐
│   │   │   ├── db/                     # 受管库 CRUD（Dashboard / EditTableDialog / 等）
│   │   │   ├── logicmodels/            # ModelRuntime 被 Dashboard 与 HomeView 复用
│   │   │   │   ├── CronPicker.tsx      # 「定时调度」字段编辑器（预设 + 自定义 + 预览）
│   │   │   │   ├── CronCell.tsx        # 表格里的调度标签,点击看接下来 5 次运行
│   │   │   │   └── cron-utils.ts       # 调度模板 / 人类可读描述 / 相对时间
│   │   │   └── ui/                     # shadcn 原子组件
│   │   ├── features/                   # 按领域拆分的类型与状态
│   │   └── lib/api.ts                  # /api/* 封装
│   └── vite.config.ts            # dev 代理 /api -> :8080
├── static/                       # 构建产物（由 restart.sh 写入）
├── data/                         # 运行时数据
│   ├── app.db                    # 系统库（账号、设置、逻辑模型、页面配置）
│   └── managed.db                # 受管库（默认指向这里，可在设置中改）
└── docs/
    └── screenshots/              # 本 README 引用的截图
```

## 关键约定

### 首页导航

`HomeView` 在移动端独占全屏（`AppShell` 的顶部 Tab 在 `tab === "home"` 时自动隐藏），底部 `BottomNav` 只展示一级页面（最多 4 个 + 设置入口）。当一级页面拥有子页面时：

- 点击一级菜单（当前激活的一级） → 切换二级菜单的显隐。
- 点击一级菜单（非占位） → 跳转到该一级页面，收起二级菜单。
- 点击一级菜单（占位 / 无关联模型） → 内容不变，避免在父页和占位页之间空跳。
- 点击二级菜单的子页面 → 进入对应子页并自动展开二级菜单。
- 二级菜单只显示子页面，不再重复出现父项；样式与一级菜单一致（左对齐、图标 + 标签 + 顶部指示条）。

### 逻辑模型 → 运行时

`POST /api/models/auto` 会基于受管库的一张表自动生成「逻辑模型」，模型记录字段业务类型（文本 / 数字 / 图片 / 引用 …）和关系。新建表时会自动建好对应的 `auto_<table>` 模型，编辑表结构（数据库 Tab 下的「编辑表」对话框）时也可一并修改字段的业务类型 / 列表 / 可搜索 / 可编辑 / 必填 / 提示，单次保存后：

- 后端在 `/api/runtime/:slug` 暴露该模型的完整 CRUD；
- 前端 `ModelRuntime` 直接渲染表格、新增 / 编辑表单、筛选、分页、上传；
- 在「页面」里把页面关联到模型 slug，运行时就会被首页的 BottomNav 链入。

#### 「定时调度」业务类型

字段业务类型里有一个 `cron`（展示名「定时调度」），用来给任意表加一个"运行频率"字段：

- **用户不用懂 cron**：表单里是 `CronPicker` —— 一排常用预设（每分钟 / 每 5 分钟 / 每小时 / 每天 0 点 / 每周一 / 每月 1 日 / 工作日 9 点 …），点一下即选中；不满足时可切到「自定义」直接写标准 5 段表达式；
- **存的是标准表达式**：落库仍是 5 段 cron 字符串（`0 3 * * *`），方便外部调度器直接读取执行；写入前由后端 `robfig/cron` 校验，非法表达式直接报错；
- **所见即所得**：选择过程中实时展示"接下来 3 次运行时间"；
- **点击查看运行时间列表**：表格里该字段显示为人类可读标签（如「工作日 9 点」），点击弹出对话框，列出接下来 5 次运行时间，同时给出「明天 03:00 / 15 小时后」这类绝对 + 相对描述，并可展开原始 ISO 时间戳。

后端对应提供 `GET /api/cron/next-runs?expr=...&count=5`：解析表达式并返回接下来 N 次运行时间（RFC3339，UTC），任何登录用户均可调用。

### 统计中心 → 页面

「统计中心」是一组**卡片**的容器，每张卡片执行一条只读 SQL 并按类型渲染。卡片与逻辑模型共用同一套页面导航——在「页面」里把页面关联到 `dashboard_id`，首页即渲染为聚合页。

- **两种卡片**：
  - `number` —— 单行单列展示为带单位/后缀的大数字（如「本月订单数 1,234 单」）；多行多列退化为紧凑表格，前 10 行。
  - `line_chart` —— X 轴 1 列（时间或分类），Y 轴勾选多个数值列；图例点击切换序列显隐，纯 SVG 渲染。
- **卡片配置 JSON**（`config` 字段，可选）：
  - `unit` / `decimals`：number 卡片用；
  - `x_column` / `y_columns`：line_chart 卡片用；
  - `columns`：列名 → 展示名的别名映射，对两种卡片都生效。
- **挂到导航**：在「页面」里编辑一个页面，把「关联模型」留空，改为「关联统计中心」选一个 dashboard，进入即看到聚合页。模型与 dashboard 二选一，不可同时设置。
- **SQL 安全**：服务端 `dashboards.SanitizeSQL` 强制要求 SELECT / WITH 前缀，禁止 `;`、注释、`INSERT`/`UPDATE`/`DELETE`/`DROP`/`ALTER`/`CREATE`/`REPLACE`/`TRUNCATE`/`ATTACH`/`DETACH`/`VACUUM`/`REINDEX`/`GRANT`/`REVOKE`/`COPY`/`PRAGMA` 等关键字；执行时强制 `LIMIT 1000`，并用 `SELECT * FROM (<SQL>) AS mc_dash LIMIT 1000` 包一层，避免被用户写绕过。
- **权限**：`view_dashboards` 用于查看统计中心与执行 SQL；`manage_dashboards` 用于新增/编辑/删除 dashboard 与卡片。
- **完整 API**（节选）：
  - `GET    /api/dashboards` —— 列出所有 dashboard；
  - `POST   /api/dashboards` —— 新建容器（`{slug,label,icon,sort}`）；
  - `GET    /api/dashboards/:id` —— 取一个 dashboard + 其全部卡片；
  - `POST   /api/dashboards/:id/cards` —— 新增卡片；
  - `PUT    /api/dashboards/:id/cards/:cardId` —— 更新卡片；
  - `POST   /api/dashboards/:id/cards/:cardId/run` —— 执行卡片 SQL，返回 `{columns, rows, config, limit}`；
  - 其余 CRUD 与图标列表见 `/swagger/`。

### 受管库切换

`data/managed.db` 是默认受管库，但「设置中心」里的 `managed_db_path` 可改成任意本地 SQLite 文件，保存后立刻生效（无需重启）。系统库（`data/app.db`）始终存放账号、设置、逻辑模型、页面配置，与受管库隔离。

## API 总览

所有受保护接口都需要 `mc_session` Cookie（由 `POST /api/auth/login` 颁发）。完整定义见运行后的 `/swagger/`：

| 路径前缀 | 说明 |
| --- | --- |
| `/api/auth/*` | 登录 / 登出 / 我 / 改密 |
| `/api/settings` | 设置中心读写 |
| `/api/uploads/*` | 文件上传 / 列表 / 删除（支持拖拽） |
| `/api/tables/*` | 受管库的表 / 列 / 行 CRUD、表结构、库状态 |
| `/api/models/*` | 逻辑模型 CRUD + 自动生成（`/auto`、`/business-types`、`/tables`、`/tables/:name/schema`） |
| `/api/runtime/:slug/*` | 逻辑模型自动生成的运行时 CRUD + schema |
| `/api/pages*` | 页面配置 CRUD + 可用图标列表(可关联逻辑模型或统计中心) |
| `/api/dashboards*` | 统计中心 CRUD + 卡片 CRUD + `/run` 只读执行卡片 SQL |
| `/api/cron/next-runs` | 解析 cron 表达式并返回接下来 N 次运行时间（「定时调度」字段用） |
| `/api/cronjobs/*` | 系统级 shell 定时任务 CRUD + 运行历史 / 日志 |
| `/api/logs*` | 日志查询 / 新建 / 删除 / 清空 + 级别 / 来源 / 关键字过滤 + 图片附件 |

### 日志服务（外部系统接入）

本服务的日志模块**只接受外部主动写入**，不会自动记录本服务的请求日志。调用方通过
`POST /api/logs` 把日志推上来，日志落到受管 SQLite 的 `logs` 表 —— 同时首次启动会在
「页面」表里写入默认的「日志」页面（slug=`logs`, 关联逻辑模型 `auto_logs`），首页底部
导航里就会挂出这个入口，用户可以像其他业务表一样用 ModelRuntime 直接增删改查、筛选
与分页。

#### 鉴权

外部脚本/服务推荐使用 **API Token**（`Authorization: Bearer <token>`）而不是 Session Cookie。
在「API」页签创建一个令牌，授予对应用户 `manage_logs` 权限。同一令牌之后可以直接复用，
适合 CI、定时任务、其它内部服务推送。

也可以用账号密码先登录拿到 Cookie：

```bash
curl -c /tmp/cookies.txt -H 'Content-Type: application/json' \
  -d '{"username":"<user>","password":"<pwd>"}' \
  http://<host>:8080/api/auth/login
```

#### 写入一条日志

```bash
curl -X POST -H 'Authorization: Bearer <token>' \
  -H 'Content-Type: application/json' \
  -d '{
    "title": "订单同步失败",
    "message": "上游 502,本服务已重试 3 次",
    "level": "error",
    "source": "order-sync",
    "metadata": { "order_id": "O-2026-0001", "attempt": 3 }
  }' \
  http://<host>:8080/api/logs
```

支持字段：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `title` | 是 | 简短标题，≤255 字 |
| `level` | 否 | `debug` / `info` / `warn` / `error`，默认 `info` |
| `source` | 否 | 来源标识（如服务名），默认 `manual` |
| `message` | 否 | 详细描述，支持多行 |
| `metadata` | 否 | 任意 JSON 对象，原样落库 |
| `image_ids` | 否 | 已上传附件的 ID 列表（见下方） |

#### 附带截图

先把图片通过现有附件接口上传，再把返回的 `id` 放进 `image_ids`：

```bash
# 1. 上传图片,返回 { "data": { "id": 42, "url": "/uploads/42", ... } }
curl -X POST -H 'Authorization: Bearer <token>' \
  -F "file=@/tmp/screenshot.png" \
  http://<host>:8080/api/uploads

# 2. 把图片 ID 写入日志
curl -X POST -H 'Authorization: Bearer <token>' \
  -H 'Content-Type: application/json' \
  -d '{
    "title": "前端白屏",
    "level": "warn",
    "source": "frontend",
    "image_ids": [42]
  }' \
  http://<host>:8080/api/logs
```

#### 查询日志

```bash
# 列出最近 20 条 error 级别日志
curl -H 'Authorization: Bearer <token>' \
  'http://<host>:8080/api/logs?level=error&limit=20'

# 关键字搜索(title / message LIKE)
curl -H 'Authorization: Bearer <token>' \
  --data-urlencode 'search=订单同步' \
  'http://<host>:8080/api/logs'
```

支持参数：`level`、`source`、`search`、`limit`（≤200，默认 50）、`offset`、`order`（asc/desc）。
返回结构里 `items[].images` 直接带 `url`，前端/脚本可以直接拿来渲染。

#### Python / Node 示例

```python
import requests
API = "http://<host>:8080/api"
TOKEN = "<token>"
requests.post(f"{API}/logs", headers={"Authorization": f"Bearer {TOKEN}"}, json={
    "title": "夜间任务崩溃", "level": "error", "source": "cron",
    "message": "OOM at step 3", "metadata": {"host": "node-7"},
})
```

```js
await fetch("http://<host>:8080/api/logs", {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    title: "Nightly job crashed",
    level: "error",
    source: "cron",
    message: "OOM at step 3",
  }),
});
```

> 默认**不会**把本服务自身的请求当成"日志"写进来 —— 那样会把审计噪音和外部业务日志
搅在一起。如确有诉求（例如想在反代前面埋点），自行在 `main.go` 把
`handlers.HTTPRequestLogMiddleware()` 挂上即可。

## 常用命令

```bash
./restart.sh 8080             # 完整构建并启动
./start.sh                    # 仅启动已编译产物
./stop.sh                     # 停止

cd web
npm run dev                   # 前端 dev server :5173
npm run build                 # tsc -b + vite build -> dist/
npm run typecheck             # tsc -b --noEmit
npm run lint                  # oxlint
```

## 许可

本项目采用自定义《蚍蜉个人与商业使用许可协议》：**个人使用免费，公司使用
需另行取得商业授权**。完整条款见 [`LICENSE`](./LICENSE)。如需商业授权或
对本协议有任何疑问，请通过仓库维护的联系方式与作者联系。
