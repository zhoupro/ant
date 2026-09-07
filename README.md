# MC Notes

一套自托管的「数据库 + 逻辑模型 + 页面」一体化工具：先把 SQLite 表建好，再配置字段业务类型，最后让页面直接展示对应表的数据 —— 全程通过 Web 完成，不写一行后端代码。

![首页占位页](docs/screenshots/home-placeholder.png)

## 主要特性

- **首页（移动优先）**：底部 Tab 展示一级页面，点亮后上方露出二级子页面，左对齐、样式与一级菜单一致。
  ![二级菜单展开](docs/screenshots/home-secondary-open.png)
- **运行时数据**：每个关联了逻辑模型的页面，自动获得增删改查表格、筛选、分页、上传字段。
  ![子页面运行时](docs/screenshots/home-runtime.png)
- **数据库管理**：左侧表列表，右侧实时 CRUD，支持新建表、修改表结构（增删列）。
  ![数据库表](docs/screenshots/dashboard-table.png)
- **逻辑模型**：从受管数据库拉取表，配置字段业务类型 / 关系，自动生成 `/api/runtime/:slug` 路由和前端表格。
  ![逻辑模型](docs/screenshots/models-list.png)
- **页面配置**：两级页面、图标、排序、关联模型，一站式管理底部导航。
  ![页面配置](docs/screenshots/pages-list.png)
- **用户与角色**：超级管理员与普通用户分表管理；角色绑定功能权限；按角色决定可见的 Tab 与可执行的操作。
- **设置中心**：上传根目录 / 受管 SQLite 路径热更新；修改密码；Swagger UI 跳转。
  ![设置中心](docs/screenshots/settings.png)

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
│   ├── tables.go                 # 受管库的表 / 列 / 行 CRUD
│   ├── schema.go                 # 表结构查询
│   ├── dbfile.go                 # 受管库状态（大小、表数量）
│   ├── upload.go                 # 文件上传 / 列表 / 删除
│   ├── settings.go               # 设置中心读写
│   └── swagger.go                # /swagger/* 文档
├── models/                       # 系统库 GORM 模型
├── logicmodels/                  # 逻辑模型存储 + 自动生成
├── pages/                        # 页面配置存储
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
│   │   │   ├── db/                     # 受管库 CRUD（Dashboard / TableView / 等）
│   │   │   ├── logicmodels/            # 逻辑模型编辑器 + 运行时
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

`POST /api/models/auto` 会基于受管库的一张表自动生成「逻辑模型」，模型记录字段业务类型（文本 / 数字 / 图片 / 引用 …）和关系。生成后：

- 后端在 `/api/runtime/:slug` 暴露该模型的完整 CRUD；
- 前端 `ModelRuntime` 直接渲染表格、新增 / 编辑表单、筛选、分页、上传；
- 在「页面」里把页面关联到模型 slug，运行时就会被首页的 BottomNav 链入。

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
| `/api/pages*` | 页面配置 CRUD + 可用图标列表 |

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
