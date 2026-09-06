import { BookOpen, LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type HomeTab =
  | "home"
  | "files"
  | "db"
  | "models"
  | "pages"
  | "api"
  | "settings";

interface AppShellProps {
  username: string;
  active: HomeTab;
  onTabChange: (tab: HomeTab) => void;
  onLogout: () => void;
  children: React.ReactNode;
  hideNav?: boolean;
}

const tabs: { key: HomeTab; label: string }[] = [
  { key: "home", label: "首页" },
  { key: "files", label: "文件" },
  { key: "db", label: "数据库" },
  { key: "models", label: "逻辑模型" },
  { key: "pages", label: "页面" },
  { key: "api", label: "API" },
  { key: "settings", label: "设置" },
];

export function AppShell({
  username,
  active,
  onTabChange,
  onLogout,
  children,
  hideNav = false,
}: AppShellProps) {
  return (
    <div className="min-h-svh bg-background">
      {!hideNav ? (
        <header className="sticky top-0 z-10 border-b border-border/60 bg-background/85 backdrop-blur">
          <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold tracking-tight">
                蚍蜉
              </span>
              <span className="hidden text-xs text-muted-foreground sm:inline">
                · {username}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="ghost"
                asChild
              >
                <a
                  href="/swagger/"
                  target="_blank"
                  rel="noreferrer"
                  title="OpenAPI / Swagger UI"
                >
                  <BookOpen className="size-3.5" />
                  <span className="hidden sm:inline">API 文档</span>
                </a>
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void onLogout()}
              >
                <LogOut className="size-3.5" />
                退出
              </Button>
            </div>
          </div>
          <nav className="mx-auto max-w-3xl overflow-x-auto px-2 pb-2">
            <div className="flex w-max gap-1">
              {tabs.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => onTabChange(t.key)}
                  className={cn(
                    "shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                    active === t.key
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </nav>
        </header>
      ) : null}
      <main
        className={cn(
          "mx-auto flex max-w-3xl flex-col px-4 py-6",
          hideNav && "h-svh py-0",
        )}
      >
        {children}
      </main>
    </div>
  );
}
