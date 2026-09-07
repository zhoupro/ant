import { BookOpen, LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { hasPermission } from "@/lib/api";
import { TAB_PERMISSIONS } from "@/features/permissions/catalog";
import type { AuthUser } from "@/features/auth/types";
import { cn } from "@/lib/utils";

export type HomeTab =
  | "home"
  | "files"
  | "db"
  | "models"
  | "pages"
  | "api"
  | "logs"
  | "settings"
  | "users"
  | "roles";

interface AppShellProps {
  user: AuthUser;
  active: HomeTab;
  onTabChange: (tab: HomeTab) => void;
  onLogout: () => void;
  children: React.ReactNode;
  hideNav?: boolean;
}

export function AppShell({
  user,
  active,
  onTabChange,
  onLogout,
  children,
  hideNav = false,
}: AppShellProps) {
  const visibleTabs = TAB_PERMISSIONS.filter((t) =>
    hasPermission(user, t.permission),
  );
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
                · {user.username}
                {user.user_kind === "regular" ? (
                  <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-[10px]">
                    普通用户
                  </span>
                ) : user.is_super_admin ? (
                  <span className="ml-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                    超级管理员
                  </span>
                ) : null}
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
              {visibleTabs.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => onTabChange(t.key as HomeTab)}
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
