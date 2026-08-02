# MC Web

基于 Vite + React 19 + TypeScript + Tailwind CSS v4 + shadcn/ui (Radix 风格) 的前端工程，替换原 `static/` 下的 CDN 方案。

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
├── App.tsx                # 顶层页面：列表 + 编辑 Sheet + 删除 AlertDialog
├── main.tsx               # createRoot 入口
├── index.css              # Tailwind v4 + shadcn 主题变量
├── lib/
│   ├── api.ts             # /api/notes 封装 + 日期格式化
│   └── utils.ts           # cn() (shadcn 自动生成)
├── features/notes/
│   └── types.ts           # Note 类型
└── components/
    ├── TopBar.tsx         # 顶部栏（标题 + ＋ 新建）
    ├── NoteCard.tsx       # 列表卡片
    ├── NoteEditor.tsx     # shadcn Sheet 编辑弹层 + AlertDialog 删除确认
    └── ui/                # shadcn 自动生成的 UI 原子组件
```

## 与后端的契约

所有请求走 `/api/notes`，由 Go Gin 提供。`vite.config.ts` 的 dev proxy 将 `/api` 反代到 `http://127.0.0.1:8080`，生产由 Gin 同一进程服务（详见 `main.go`）。

字段定义见 `src/features/notes/types.ts`，必须与 `models/models.go` 的 JSON tag 一致。
