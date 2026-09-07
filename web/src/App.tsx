import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Toaster } from "@/components/ui/sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AppShell, type HomeTab } from "@/components/AppShell";
import { APITokens } from "@/components/APITokens";
import { Files } from "@/components/Files";
import { LoginForm } from "@/components/LoginForm";
import { ChangePasswordForm } from "@/components/ChangePasswordForm";
import { Settings } from "@/components/Settings";
import { Dashboard } from "@/components/db/Dashboard";
import { ModelsList } from "@/components/logicmodels/ModelsList";
import { PagesList } from "@/components/pages/PagesList";
import { HomeView } from "@/components/pages/HomeView";
import { UsersManagement } from "@/components/users/UsersManagement";
import { RolesManagement } from "@/components/users/RolesManagement";
import {
  changePassword,
  login,
  logout as apiLogout,
  me,
} from "@/lib/api";
import { hasPermission } from "@/lib/api";
import type { AuthUser } from "@/features/auth/types";
import type { Page } from "@/features/pages/types";
import { TAB_PERMISSIONS } from "@/features/permissions/catalog";

type View =
  | { kind: "loading" }
  | { kind: "login" }
  | { kind: "change-password"; user: AuthUser }
  | { kind: "home"; user: AuthUser };

function firstVisibleTab(user: AuthUser): HomeTab {
  const fallback = (TAB_PERMISSIONS.find((t) => hasPermission(user, t.permission))?.key ??
    "home") as HomeTab;
  return fallback;
}

export default function App() {
  const [view, setView] = useState<View>({ kind: "loading" });
  const [tab, setTab] = useState<HomeTab>("home");
  const [pendingModelSlug, setPendingModelSlug] = useState<string | null>(null);
  const [editingPage, setEditingPage] = useState<Page | null>(null);
  const [, setActivePageId] = useState<string | null>(null);

  const checkAuth = useCallback(async () => {
    try {
      const user = await me();
      setView({ kind: "home", user });
      setTab(firstVisibleTab(user));
    } catch {
      setView({ kind: "login" });
    }
  }, []);

  useEffect(() => {
    void checkAuth();
  }, [checkAuth]);

  const handleLogout = useCallback(async () => {
    try {
      await apiLogout();
    } catch {
      toast.error("退出登录失败");
    } finally {
      setView({ kind: "login" });
    }
  }, []);

  if (view.kind === "loading") {
    return <BootScreen />;
  }
  if (view.kind === "login") {
    return (
      <>
        <LoginForm
          onSubmit={async (input) => {
            const user = await login(input);
            setView({ kind: "home", user });
            setTab(firstVisibleTab(user));
            toast.success(`欢迎回来，${user.username}`);
          }}
        />
        <Toaster position="top-center" richColors />
      </>
    );
  }
  if (view.kind === "change-password") {
    return (
      <>
        <ChangePasswordForm
          username={view.user.username}
          onSubmit={async (input) => {
            const user = await changePassword(input);
            setView({ kind: "home", user });
            setTab(firstVisibleTab(user));
            toast.success("密码已更新");
          }}
        />
        <Toaster position="top-center" richColors />
      </>
    );
  }

  const canFiles = hasPermission(view.user, "view_files");
  const canDb = hasPermission(view.user, "view_database");
  const canModels = hasPermission(view.user, "view_models");
  const canPages = hasPermission(view.user, "view_pages");
  const canApi = hasPermission(view.user, "view_api_tokens");
  const canSettings = hasPermission(view.user, "view_settings");
  const canUsers = hasPermission(view.user, "manage_users");
  const canRoles = hasPermission(view.user, "manage_roles");

  return (
    <>
      <AppShell
        user={view.user}
        active={tab}
        onTabChange={setTab}
        onLogout={handleLogout}
        hideNav={tab === "home"}
      >
        {tab === "home" ? (
          <HomeView onGoToSettings={() => setTab("settings")} />
        ) : tab === "files" && canFiles ? (
          <Files />
        ) : tab === "settings" && canSettings ? (
          <Settings
            username={view.user.username}
            onUsernameChanged={(next) =>
              setView((prev) =>
                prev.kind === "home" ? { kind: "home", user: { ...prev.user, username: next } } : prev,
              )
            }
          />
        ) : tab === "models" && canModels ? (
          <ModelsList
            onGoToDB={() => setTab("db")}
            initialSlug={pendingModelSlug}
            onInitialSlugConsumed={() => setPendingModelSlug(null)}
          />
        ) : tab === "pages" && canPages ? (
          <Card className="w-full max-w-3xl shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">页面配置</CardTitle>
              <CardDescription>
                配置底部导航的页面,最多两级,每个页面关联一个逻辑模型,进入即展示其数据表格
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <PagesList
                onOpenPage={(p) => {
                  setActivePageId(p.id);
                  setTab("home");
                }}
                initialEdit={editingPage}
                onEditConsumed={() => setEditingPage(null)}
              />
            </CardContent>
          </Card>
        ) : tab === "api" && canApi ? (
          <APITokens />
        ) : tab === "users" && canUsers ? (
          <UsersManagement currentUser={view.user} />
        ) : tab === "roles" && canRoles ? (
          <RolesManagement />
        ) : tab === "db" && canDb ? (
          <Dashboard
            onGoToSettings={() => setTab("settings")}
            onGoToModel={(slug) => {
              setPendingModelSlug(slug);
              setTab("models");
            }}
          />
        ) : (
          <NoPermissionCard tab={tab} />
        )}
      </AppShell>
      <Toaster position="top-center" richColors />
    </>
  );
}

function NoPermissionCard({ tab }: { tab: HomeTab }) {
  return (
    <Card className="w-full max-w-md shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">无权访问</CardTitle>
        <CardDescription>
          当前账号没有被授予 {TAB_PERMISSIONS.find((t) => t.key === tab)?.label ?? tab}
          {" "}的权限，请联系管理员。
        </CardDescription>
      </CardHeader>
    </Card>
  );
}

function BootScreen() {
  return (
    <div className="min-h-svh flex items-center justify-center bg-background text-muted-foreground">
      <span className="text-sm">加载中…</span>
    </div>
  );
}
