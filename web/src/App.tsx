import { useCallback, useEffect, useState } from "react";
import {
  Navigate,
  Route,
  Routes,
  useNavigate,
  useParams,
} from "react-router-dom";
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
import { CronJobs } from "@/components/CronJobs";
import { DashboardsList } from "@/components/dashboards/DashboardsList";
import { Files } from "@/components/Files";
import { ModelsList } from "@/components/logicmodels/ModelsList";
import { LoginForm } from "@/components/LoginForm";
import { ChangePasswordForm } from "@/components/ChangePasswordForm";
import { Settings } from "@/components/Settings";
import { Dashboard } from "@/components/db/Dashboard";
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

function firstVisibleTabPath(user: AuthUser): string {
  const fallback =
    TAB_PERMISSIONS.find((t) => hasPermission(user, t.permission))?.key ??
    "home";
  return `/${fallback}`;
}

export default function App() {
  const [view, setView] = useState<View>({ kind: "loading" });
  const [editingPage, setEditingPage] = useState<Page | null>(null);
  const navigate = useNavigate();

  const checkAuth = useCallback(async () => {
    try {
      const user = await me();
      setView({ kind: "home", user });
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
      navigate("/");
    }
  }, [navigate]);

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
            navigate(firstVisibleTabPath(user), { replace: true });
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
            navigate(firstVisibleTabPath(user), { replace: true });
            toast.success("密码已更新");
          }}
        />
        <Toaster position="top-center" richColors />
      </>
    );
  }

  const user = view.user;
  const canFiles = hasPermission(user, "view_files");
  const canDb = hasPermission(user, "view_database");
  const canModels = hasPermission(user, "view_models");
  const canPages = hasPermission(user, "view_pages");
  const canDashboards = hasPermission(user, "view_dashboards");
  const canApi = hasPermission(user, "view_api_tokens");
  const canCron = hasPermission(user, "view_cron_jobs");
  const canSettings = hasPermission(user, "view_settings");
  const canUsers = hasPermission(user, "manage_users");
  const canRoles = hasPermission(user, "manage_roles");

  return (
    <Routes>
      <Route
        path="/"
        element={
          <Navigate
            to={firstVisibleTabPath(user).slice(1)}
            replace
          />
        }
      />
      <Route
        path="/home"
        element={
          <AppShell user={user} onLogout={handleLogout} hideNav>
            <HomeView onGoToSettings={() => navigate("/settings")} />
          </AppShell>
        }
      />
      <Route
        path="/p/:pageId"
        element={
          <AppShell user={user} onLogout={handleLogout} hideNav>
            <PageRoute
              onGoToSettings={() => navigate("/settings")}
            />
          </AppShell>
        }
      />
      <Route
        path="/files"
        element={
          <AppShell user={user} onLogout={handleLogout}>
            {canFiles ? <Files /> : <NoPermissionCard tab="files" />}
          </AppShell>
        }
      />
      <Route
        path="/db"
        element={
          <AppShell user={user} onLogout={handleLogout}>
            {canDb ? (
              <Dashboard onGoToSettings={() => navigate("/settings")} />
            ) : (
              <NoPermissionCard tab="db" />
            )}
          </AppShell>
        }
      />
      <Route
        path="/models"
        element={
          <AppShell user={user} onLogout={handleLogout}>
            {canModels ? (
              <ModelsList onGoToDB={() => navigate("/db")} />
            ) : (
              <NoPermissionCard tab="models" />
            )}
          </AppShell>
        }
      />
      <Route
        path="/dashboards"
        element={
          <AppShell user={user} onLogout={handleLogout}>
            {canDashboards ? (
              <Card className="w-full max-w-3xl shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">统计中心</CardTitle>
                  <CardDescription>
                    一个统计中心由若干张「卡片」组成,每张卡片执行一条只读 SQL,
                    可以是数字 / 表格或折线图。配置完成后,把它挂到任意页面下,即在首页渲染。
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <DashboardsList />
                </CardContent>
              </Card>
            ) : (
              <NoPermissionCard tab="dashboards" />
            )}
          </AppShell>
        }
      />
      <Route
        path="/pages"
        element={
          <AppShell user={user} onLogout={handleLogout}>
            {canPages ? (
              <Card className="w-full max-w-3xl shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">页面配置</CardTitle>
                  <CardDescription>
                    配置底部导航的页面,最多两级,每个页面关联一个逻辑模型或一个统计中心,进入即展示其内容
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <PagesList
                    onOpenPage={(p) => navigate(`/p/${p.id}`)}
                    initialEdit={editingPage}
                    onEditConsumed={() => setEditingPage(null)}
                  />
                </CardContent>
              </Card>
            ) : (
              <NoPermissionCard tab="pages" />
            )}
          </AppShell>
        }
      />
      <Route
        path="/cron"
        element={
          <AppShell user={user} onLogout={handleLogout}>
            {canCron ? (
              <CronJobs user={user} />
            ) : (
              <NoPermissionCard tab="cron" />
            )}
          </AppShell>
        }
      />
      <Route
        path="/api"
        element={
          <AppShell user={user} onLogout={handleLogout}>
            {canApi ? <APITokens /> : <NoPermissionCard tab="api" />}
          </AppShell>
        }
      />
      <Route
        path="/settings"
        element={
          <AppShell user={user} onLogout={handleLogout}>
            {canSettings ? (
              <Settings
                username={user.username}
                onUsernameChanged={(next) =>
                  setView((prev) =>
                    prev.kind === "home"
                      ? { kind: "home", user: { ...prev.user, username: next } }
                      : prev,
                  )
                }
              />
            ) : (
              <NoPermissionCard tab="settings" />
            )}
          </AppShell>
        }
      />
      <Route
        path="/users"
        element={
          <AppShell user={user} onLogout={handleLogout}>
            {canUsers ? (
              <UsersManagement currentUser={user} />
            ) : (
              <NoPermissionCard tab="users" />
            )}
          </AppShell>
        }
      />
      <Route
        path="/roles"
        element={
          <AppShell user={user} onLogout={handleLogout}>
            {canRoles ? (
              <RolesManagement />
            ) : (
              <NoPermissionCard tab="roles" />
            )}
          </AppShell>
        }
      />
      <Route
        path="*"
        element={
          <AppShell user={user} onLogout={handleLogout}>
            <NotFoundCard />
          </AppShell>
        }
      />
    </Routes>
  );
}

// PageRoute 把 URL 中的 :pageId 透传给 HomeView。
// 单独抽出是为了能用 react-router 的 useParams 钩子。
function PageRoute({ onGoToSettings }: { onGoToSettings: () => void }) {
  const { pageId } = useParams<{ pageId: string }>();
  return (
    <HomeView onGoToSettings={onGoToSettings} activePageId={pageId} />
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

function NotFoundCard() {
  return (
    <Card className="w-full max-w-md shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">页面不存在</CardTitle>
        <CardDescription>请通过顶部导航选择功能。</CardDescription>
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
