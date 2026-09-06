# MC Web

`MC Notes` 的前端工程，Vite + React 19 + TypeScript + Tailwind CSS v4 + shadcn/ui。完整说明见仓库根目录 [`README.md`](../README.md)。

## 常用命令

```bash
npm install                # 安装依赖
npm run dev                # 开发服务，http://localhost:5173（/api 代理到 :8080）
npm run build              # 类型检查 + 生产构建，输出 dist/
npm run typecheck          # 仅类型检查
npm run lint               # oxlint
```

通过仓库根目录的 `restart.sh [PORT]` 启动完整后端 + 前端构建：

```bash
./restart.sh 8080          # 自动 npm install + npm run build + 拷贝到 static/ + go build + 启动
SKIP_WEB_BUILD=1 ./restart.sh 8080  # 跳过前端构建，仅重建后端
```

## 目录结构

```
src/
├── App.tsx                    # 顶层路由：home / files / db / models / pages / settings
├── main.tsx                   # createRoot 入口
├── index.css                  # Tailwind v4 + shadcn 主题变量
├── lib/
│   ├── api.ts                 # /api/* 封装 + 通用格式化
│   └── utils.ts               # cn() (shadcn 自动生成)
├── features/                  # 按领域拆分的类型
│   ├── auth/types.ts
│   ├── db/types.ts
│   ├── logicmodels/types.ts
│   └── pages/
│       ├── types.ts
│       └── icon.ts            # lucide-react 图标名 -> 组件
└── components/
    ├── AppShell.tsx           # 顶部布局 + Tab 栏（首页隐藏）
    ├── LoginForm.tsx
    ├── ChangePasswordForm.tsx
    ├── Settings.tsx           # 设置中心
    ├── Files.tsx              # 文件上传 / 列表 / 删除
    ├── pages/
    │   ├── HomeView.tsx       # 首页（一级 + 二级菜单、运行时）
    │   ├── BottomNav.tsx      # 一级菜单
    │   └── PagesList.tsx      # 页面配置列表
    ├── db/                    # 受管库：Dashboard / TableView / RowEditor / Dialogs
    ├── logicmodels/           # 逻辑模型：ModelsList / ModelEditor / ModelRuntime
    └── ui/                    # shadcn 自动生成的 UI 原子组件
```

## 与后端的契约

所有请求走 `/api/*`，由 Go Gin 提供。`vite.config.ts` 的 dev proxy 将 `/api` 反代到 `http://127.0.0.1:8080`，生产由 Gin 同一进程服务（详见仓库根 `main.go`）。

字段定义见各 `features/*/types.ts`，必须与 Go 侧 `models/`、`logicmodels/` 的 JSON tag 一致。
